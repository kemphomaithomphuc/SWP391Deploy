package swp391.code.swp391.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import swp391.code.swp391.dto.ChangeChargingPointRequestDTO;
import swp391.code.swp391.dto.ChangeChargingPointResponseDTO;
import swp391.code.swp391.dto.ChargingPointDTO;
import swp391.code.swp391.entity.*;
import swp391.code.swp391.entity.ChargingPoint.ChargingPointStatus;
import swp391.code.swp391.repository.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StaffServiceImpl implements StaffService {

    private final OrderRepository orderRepository;
    private final ChargingPointRepository chargingPointRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    @Override
    @Transactional
    public ChangeChargingPointResponseDTO changeChargingPointForDriver(ChangeChargingPointRequestDTO request) {

        log.info("Starting change charging point process for order: {}", request.getOrderId());

        // 1. Validate Order
        Order order = orderRepository.findByOrderId(request.getOrderId());
        if (order == null) {
            throw new RuntimeException("Không tìm thấy đơn đặt chỗ với ID: " + request.getOrderId());
        }

        // 2. Kiểm tra trạng thái order (chỉ cho phép đổi khi BOOKED - chưa bắt đầu sạc)
        if (order.getStatus() != Order.Status.BOOKED) {
            throw new RuntimeException(
                    String.format("Không thể đổi trụ sạc cho đơn có trạng thái: %s. Chỉ cho phép đổi khi trạng thái BOOKED",
                            order.getStatus())
            );
        }

        // 3. Kiểm tra thời gian - chỉ cho phép đổi trước giờ bắt đầu
        if (LocalDateTime.now().isAfter(order.getStartTime())) {
            throw new RuntimeException("Không thể đổi trụ sạc sau thời gian bắt đầu đã đặt");
        }

        // 4. Validate Current Charging Point
        ChargingPoint currentPoint = chargingPointRepository.findById(request.getCurrentChargingPointId())
                .orElseThrow(() -> new RuntimeException(
                        "Không tìm thấy trụ sạc hiện tại với ID: " + request.getCurrentChargingPointId()));

        // 5. Kiểm tra current point có phải của order này không
        if (!order.getChargingPoint().getChargingPointId().equals(currentPoint.getChargingPointId())) {
            throw new RuntimeException(
                    String.format("Trụ sạc ID %d không phải là trụ sạc của đơn đặt chỗ này",
                            request.getCurrentChargingPointId())
            );
        }

        // 6. Validate New Charging Point
        ChargingPoint newPoint = chargingPointRepository.findById(request.getNewChargingPointId())
                .orElseThrow(() -> new RuntimeException(
                        "Không tìm thấy trụ sạc mới với ID: " + request.getNewChargingPointId()));

        // 7. Kiểm tra trụ mới có cùng station không
        if (!currentPoint.getStation().getStationId().equals(newPoint.getStation().getStationId())) {
            throw new RuntimeException(
                    String.format("Trụ sạc mới phải nằm trong cùng trạm sạc: %s",
                            currentPoint.getStation().getStationName())
            );
        }

        // 8. Kiểm tra trụ mới có cùng loại connector không
        if (!currentPoint.getConnectorType().getConnectorTypeId()
                .equals(newPoint.getConnectorType().getConnectorTypeId())) {
            throw new RuntimeException(
                    String.format("Trụ sạc mới phải có cùng loại connector: %s. Trụ bạn chọn có connector: %s",
                            currentPoint.getConnectorType().getTypeName(),
                            newPoint.getConnectorType().getTypeName())
            );
        }

        // 9. Kiểm tra trụ mới có available không
        if (newPoint.getStatus() != ChargingPointStatus.AVAILABLE) {
            throw new RuntimeException(
                    String.format("Trụ sạc mới không ở trạng thái AVAILABLE. Trạng thái hiện tại: %s",
                            newPoint.getStatus())
            );
        }

        // 10. Kiểm tra trụ mới có bị trùng thời gian với booking khác không
        List<Order> conflictingOrders = orderRepository.findConflictingOrders(
                newPoint.getChargingPointId(),
                order.getStartTime(),
                order.getEndTime(),
                order.getOrderId()
        );

        if (!conflictingOrders.isEmpty()) {
            throw new RuntimeException(
                    String.format("Trụ sạc mới đã có booking khác trong khung giờ %s - %s",
                            order.getStartTime(), order.getEndTime())
            );
        }

        // 11. Cập nhật Order với Charging Point mới
        ChargingPoint oldPoint = order.getChargingPoint();
        order.setChargingPoint(newPoint);
        orderRepository.save(order);

        log.info("Updated order {} from charging point {} to {}",
                order.getOrderId(), oldPoint.getChargingPointId(), newPoint.getChargingPointId());

        // 12. Cập nhật trạng thái các trụ sạc
        // Nếu current point đang RESERVED, đổi về AVAILABLE
        if (currentPoint.getStatus() == ChargingPointStatus.RESERVED) {
            currentPoint.setStatus(ChargingPointStatus.AVAILABLE);
            chargingPointRepository.save(currentPoint);
            log.info("Released charging point {} to AVAILABLE", currentPoint.getChargingPointId());
        }

        // Đặt trụ mới thành RESERVED
        newPoint.setStatus(ChargingPointStatus.RESERVED);
        chargingPointRepository.save(newPoint);
        log.info("Reserved new charging point {}", newPoint.getChargingPointId());

        // 13. Lấy thông tin Staff
        User staff = null;
        String staffName = "System";
        if (request.getStaffId() != null) {
            staff = userRepository.findById(request.getStaffId()).orElse(null);
            if (staff != null) {
                staffName = staff.getFullName();
            }
        }

        // 14. Gửi thông báo cho Driver
        String notificationContent = String.format(
                "🔄 Thông báo đổi trụ sạc\n\n" +
                        "Trụ sạc của bạn đã được thay đổi:\n" +
                        "• Từ: Trụ #%d\n" +
                        "• Sang: Trụ #%d\n" +
                        "• Trạm: %s\n" +
                        "• Loại connector: %s (%.1f kW)\n" +
                        "• Thời gian: %s - %s\n" +
                        "• Lý do: %s\n" +
                        "• Thực hiện bởi: %s\n\n" +
                        "Vui lòng đến đúng trụ sạc mới!",
                currentPoint.getChargingPointId(),
                newPoint.getChargingPointId(),
                newPoint.getStation().getStationName(),
                newPoint.getConnectorType().getTypeName(),
                newPoint.getConnectorType().getPowerOutput(),
                order.getStartTime(),
                order.getEndTime(),
                request.getReason() != null ? request.getReason() : "Driver trước chưa rút sạc ra",
                staffName
        );

        boolean notificationSent = false;
        try {
            // Gửi notification trực tiếp cho user của order
            notificationService.createGeneralNotification(
                    List.of(order.getUser().getUserId()),
                    "Đổi trụ sạc - Order #" + order.getOrderId(),
                    notificationContent
            );
            notificationSent = true;
            log.info("Notification sent to driver (User ID: {}) for order: {}",
                    order.getUser().getUserId(), order.getOrderId());
        } catch (Exception e) {
            log.error("Failed to send notification to driver: {}", e.getMessage());
            // Không throw exception, vẫn trả về success vì việc đổi trụ đã thành công
        }

        // 15. Tạo response
        return ChangeChargingPointResponseDTO.builder()
                .orderId(order.getOrderId())
                .oldChargingPointId(currentPoint.getChargingPointId())
                .oldChargingPointInfo(String.format("Trụ #%d - %s - %.1f kW",
                        currentPoint.getChargingPointId(),
                        currentPoint.getConnectorType().getTypeName(),
                        currentPoint.getConnectorType().getPowerOutput()))
                .newChargingPointId(newPoint.getChargingPointId())
                .newChargingPointInfo(String.format("Trụ #%d - %s - %.1f kW",
                        newPoint.getChargingPointId(),
                        newPoint.getConnectorType().getTypeName(),
                        newPoint.getConnectorType().getPowerOutput()))
                .driverName(order.getUser().getFullName())
                .driverId(order.getUser().getUserId())
                .reason(request.getReason())
                .changedAt(LocalDateTime.now())
                .changedByStaff(staffName)
                .notificationSent(notificationSent)
                .message(notificationSent
                        ? "Đổi trụ sạc thành công và đã thông báo cho driver"
                        : "Đổi trụ sạc thành công nhưng gửi thông báo thất bại")
                .build();
    }

    @Override
    public List<ChargingPointDTO> findAlternativeChargingPoints(Long orderId, Long currentChargingPointId) {

        log.info("Finding alternative charging points for order: {}", orderId);

        // 1. Lấy thông tin order
        Order order = orderRepository.findByOrderId(orderId);
        if (order == null) {
            throw new RuntimeException("Không tìm thấy đơn đặt chỗ với ID: " + orderId);
        }

        // 2. Kiểm tra trạng thái order
        if (order.getStatus() != Order.Status.BOOKED) {
            throw new RuntimeException(
                    String.format("Không thể tìm trụ thay thế cho đơn có trạng thái: %s", order.getStatus())
            );
        }

        // 3. Lấy thông tin current charging point
        ChargingPoint currentPoint = chargingPointRepository.findById(currentChargingPointId)
                .orElseThrow(() -> new RuntimeException(
                        "Không tìm thấy trụ sạc với ID: " + currentChargingPointId));

        Long stationId = currentPoint.getStation().getStationId();
        Long connectorTypeId = currentPoint.getConnectorType().getConnectorTypeId();

        // 4. Tìm các trụ sạc thay thế: cùng station, cùng connector type, status = AVAILABLE
        List<ChargingPoint> allAvailablePoints = chargingPointRepository
                .findByStation_StationIdAndConnectorType_ConnectorTypeIdAndStatus(
                        stationId,
                        connectorTypeId,
                        ChargingPointStatus.AVAILABLE
                );

        // 5. Lọc ra các trụ không trùng thời gian với order khác
        List<ChargingPoint> alternativePoints = allAvailablePoints.stream()
                .filter(point -> {
                    // Loại bỏ trụ hiện tại
                    if (point.getChargingPointId().equals(currentChargingPointId)) {
                        return false;
                    }

                    // Kiểm tra xem trụ này có bị trùng lịch không
                    List<Order> conflicts = orderRepository.findConflictingOrders(
                            point.getChargingPointId(),
                            order.getStartTime(),
                            order.getEndTime(),
                            order.getOrderId()
                    );

                    return conflicts.isEmpty();
                })
                .collect(Collectors.toList());

        log.info("Found {} alternative charging points for order {}", alternativePoints.size(), orderId);

        // 6. Convert sang DTO - CHỈ TRẢ VỀ ID, KHÔNG TRẢ VỀ NESTED OBJECT
        return alternativePoints.stream()
                .map(point -> {
                    ChargingPointDTO dto = new ChargingPointDTO();
                    dto.setChargingPointId(point.getChargingPointId());
                    dto.setStatus(point.getStatus());
                    dto.setStationId(point.getStation().getStationId()); // CHỈ ID
                    dto.setConnectorTypeId(point.getConnectorType().getConnectorTypeId()); // CHỈ ID
                    dto.setTypeName(point.getConnectorType().getTypeName());
                    dto.setPowerOutput(point.getConnectorType().getPowerOutput());
                    dto.setPricePerKwh(point.getConnectorType().getPricePerKWh());
                    // KHÔNG SET station và connectorType object để tránh circular reference
                    return dto;
                })
                .collect(Collectors.toList());
    }
}