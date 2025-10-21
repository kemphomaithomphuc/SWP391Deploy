package swp391.code.swp391.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import swp391.code.swp391.dto.*;
import swp391.code.swp391.entity.*;
import swp391.code.swp391.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentServiceImpl implements PaymentService {

    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final FeeRepository feeRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PriceFactorRepository priceFactorRepository;
    private final FeeCalculationService feeCalculationService;
    private final NotificationService notificationService;
    private final VNPayService vnPayService;
    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Override
    public BigDecimal calculatePaymentAmount(Long sessionId, Long userId) {
        log.info("Đang tính toán số tiền thanh toán cho session: {}, user: {}", sessionId, userId);

        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy phiên sạc với ID: " + sessionId));

        // Kiểm tra session đã hoàn thành chưa
        if (session.getStatus() != Session.SessionStatus.COMPLETED) {
            throw new RuntimeException("Phiên sạc chưa hoàn thành, không thể thanh toán");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy người dùng với ID: " + userId));

        // Bước 1: Tính chi phí cơ bản (baseCost)
        BigDecimal baseCost = calculateBaseCost(session, user);

        // Bước 2: Tính tổng các khoản phí
        List<Fee> fees = feeCalculationService.getSessionFees(sessionId);
        BigDecimal totalFees = feeCalculationService.calculateTotalFees(fees);

        // Tổng số tiền = baseCost + totalFees
        BigDecimal totalAmount = baseCost.add(totalFees);

        log.info("Tính toán hoàn tất - Base Cost: {}, Total Fees: {}, Total Amount: {}",
                baseCost, totalFees, totalAmount);

        return totalAmount.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Tính chi phí cơ bản của phiên sạc
     * Công thức: powerConsumed × basePrice × priceFactor × (1 - subscriptionDiscount)
     */
    private BigDecimal calculateBaseCost(Session session, User user) {
        // 1. Lấy lượng điện tiêu thụ (kWh)
        BigDecimal powerConsumed = BigDecimal.valueOf(session.getPowerConsumed());

        // 2. Lấy giá cơ bản từ ConnectorType (VND/kWh)
        BigDecimal basePrice = getBasePrice(session);

        // 3. Lấy hệ số giá theo khung giờ (priceFactor)
        BigDecimal priceFactor = getPriceFactor(session);

        // 4. Lấy giảm giá theo gói đăng ký (subscriptionDiscount)
        BigDecimal subscriptionDiscount = getSubscriptionDiscount(user);

        // Tính toán: powerConsumed × basePrice × priceFactor × (1 - subscriptionDiscount)
        BigDecimal baseCost = powerConsumed
                .multiply(basePrice)
                .multiply(priceFactor)
                .multiply(BigDecimal.ONE.subtract(subscriptionDiscount))
                .setScale(2, RoundingMode.HALF_UP);

        log.info("Chi tiết tính baseCost - Power: {} kWh, BasePrice: {} VND/kWh, PriceFactor: {}, Discount: {}%, Result: {} VND",
                powerConsumed, basePrice, priceFactor, subscriptionDiscount.multiply(new BigDecimal("100")), baseCost);

        return baseCost;
    }

    /**
     * Lấy giá cơ bản từ ConnectorType
     */
    private BigDecimal getBasePrice(Session session) {
        if (session.getOrder() == null ||
                session.getOrder().getChargingPoint() == null ||
                session.getOrder().getChargingPoint().getConnectorType() == null) {
            throw new RuntimeException("Không tìm thấy thông tin ConnectorType cho session");
        }

        Double pricePerKWh = session.getOrder().getChargingPoint()
                .getConnectorType().getPricePerKWh();

        return BigDecimal.valueOf(pricePerKWh);
    }

    /**
     * Lấy hệ số giá theo khung giờ
     * - Giờ cao điểm (10:00-12:00, 17:00-20:00): 1.5
     * - Giờ bình thường: 1.0
     */
    private BigDecimal getPriceFactor(Session session) {
        if (session.getStartTime() == null) {
            return BigDecimal.ONE;
        }

        LocalTime startTime = session.getStartTime().toLocalTime();

        // Kiểm tra giờ cao điểm
        boolean isPeakHour = (startTime.isAfter(LocalTime.of(10, 0)) && startTime.isBefore(LocalTime.of(12, 0))) ||
                (startTime.isAfter(LocalTime.of(17, 0)) && startTime.isBefore(LocalTime.of(20, 0)));

        if (isPeakHour) {
            log.info("Phiên sạc trong giờ cao điểm - áp dụng hệ số 1.5");
            return new BigDecimal("1.5");
        }

        // Có thể lấy từ database PriceFactor nếu có cấu hình động
        if (session.getOrder() != null &&
                session.getOrder().getChargingPoint() != null &&
                session.getOrder().getChargingPoint().getStation() != null) {

            Long stationId = session.getOrder().getChargingPoint().getStation().getStationId();
            List<PriceFactor> priceFactors = priceFactorRepository.findByStationStationId(stationId);

            for (PriceFactor pf : priceFactors) {
                if (pf.getStartTime() != null && pf.getEndTime() != null) {
                    LocalTime pfStart = pf.getStartTime().toLocalTime();
                    LocalTime pfEnd = pf.getEndTime().toLocalTime();

                    if (startTime.isAfter(pfStart) && startTime.isBefore(pfEnd)) {
                        return BigDecimal.valueOf(pf.getFactor());
                    }
                }
            }
        }

        log.info("Phiên sạc trong giờ bình thường - áp dụng hệ số 1.0");
        return BigDecimal.ONE;
    }

    /**
     * Lấy mức giảm giá theo gói đăng ký
     * - BASIC: 0% (không giảm giá)
     * - PLUS: 10% (giảm 10%)
     * - PREMIUM: 20% (giảm 20%)
     */
    private BigDecimal getSubscriptionDiscount(User user) {
        List<Subscription> subscriptions = subscriptionRepository.findByUserAndEndDateAfter(
                user, LocalDateTime.now());

        if (subscriptions.isEmpty()) {
            log.info("Người dùng không có gói đăng ký - không giảm giá");
            return BigDecimal.ZERO;
        }

        // Lấy gói đăng ký cao nhất
        Subscription activeSubscription = subscriptions.stream()
                .max((s1, s2) -> s1.getType().compareTo(s2.getType()))
                .orElse(null);

        if (activeSubscription == null) {
            return BigDecimal.ZERO;
        }

        BigDecimal discount = switch (activeSubscription.getType()) {
            case PREMIUM -> new BigDecimal("0.20"); // 20%
            case PLUS -> new BigDecimal("0.10");    // 10%
            case BASIC -> BigDecimal.ZERO;          // 0%
        };

        log.info("Áp dụng giảm giá gói {}: {}%",
                activeSubscription.getType(),
                discount.multiply(new BigDecimal("100")));

        return discount;
    }

    @Override
    public PaymentDetailDTO getPaymentDetail(Long sessionId, Long userId) {
        log.info("Lấy chi tiết thanh toán cho session: {}, user: {}", sessionId, userId);

        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy phiên sạc"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy người dùng"));

        // Tính toán các giá trị
        BigDecimal basePrice = getBasePrice(session);
        BigDecimal priceFactor = getPriceFactor(session);
        BigDecimal subscriptionDiscount = getSubscriptionDiscount(user);
        BigDecimal baseCost = calculateBaseCost(session, user);

        List<Fee> fees = feeCalculationService.getSessionFees(sessionId);
        BigDecimal totalFees = feeCalculationService.calculateTotalFees(fees);

        List<FeeDetailDTO> feeDetails = fees.stream()
                .map(fee -> FeeDetailDTO.builder()
                        .type(fee.getType())
                        .amount(BigDecimal.valueOf(fee.getAmount()))
                        .description(fee.getDescription())
                        .build())
                .collect(Collectors.toList());

        BigDecimal totalAmount = baseCost.add(totalFees);

        // Lấy thông tin trạm sạc
        String stationName = "N/A";
        String stationAddress = "N/A";
        if (session.getOrder() != null &&
                session.getOrder().getChargingPoint() != null &&
                session.getOrder().getChargingPoint().getStation() != null) {
            ChargingStation station = session.getOrder().getChargingPoint().getStation();
            stationName = station.getStationName();
            stationAddress = station.getAddress();
        }

        return PaymentDetailDTO.builder()
                .userName(user.getFullName())
                .userEmail(user.getEmail())
                .stationName(stationName)
                .stationAddress(stationAddress)
                .sessionStartTime(session.getStartTime())
                .sessionEndTime(session.getEndTime())
                .powerConsumed(BigDecimal.valueOf(session.getPowerConsumed()))
                .basePrice(basePrice)
                .priceFactor(priceFactor)
                .subscriptionDiscount(subscriptionDiscount)
                .baseCost(baseCost)
                .fees(feeDetails)
                .totalFees(totalFees)
                .totalAmount(totalAmount)
                .build();
    }

    @Override
    @Transactional
    public PaymentResponseDTO initiatePayment(PaymentRequestDTO request) {
        log.info("Khởi tạo thanh toán - Session: {}, User: {}, Method: {}",
                request.getSessionId(), request.getUserId(), request.getPaymentMethod());

        // Kiểm tra session
        Session session = sessionRepository.findById(request.getSessionId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy phiên sạc"));

        if (session.getStatus() != Session.SessionStatus.COMPLETED) {
            throw new RuntimeException("Phiên sạc chưa hoàn thành, không thể thanh toán");
        }

        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new RuntimeException("Không tìm thấy người dùng"));

        // Tính số tiền thanh toán
        BigDecimal amount = calculatePaymentAmount(request.getSessionId(), request.getUserId());

        // Tạo Transaction với trạng thái PENDING
        Transaction transaction = new Transaction();
        transaction.setSession(session);
        transaction.setUser(user);
        transaction.setAmount(amount.doubleValue());
        transaction.setPaymentMethod(request.getPaymentMethod());
        transaction.setStatus(Transaction.Status.PENDING);

        transaction = transactionRepository.save(transaction);

        // Xử lý theo phương thức thanh toán
        if (request.getPaymentMethod() == Transaction.PaymentMethod.CASH) {
            return processCashPayment(request.getSessionId(), request.getUserId());
        } else if (request.getPaymentMethod() == Transaction.PaymentMethod.VNPAY) {
            // Tạo URL thanh toán VNPay
            String paymentUrl = vnPayService.createPaymentUrl(
                    transaction.getTransactionId(),
                    amount,
                    "Thanh toan phien sac #" + session.getSessionId(),
                    request.getReturnUrl(),
                    request.getBankCode()
            );

            return PaymentResponseDTO.builder()
                    .transactionId(transaction.getTransactionId())
                    .sessionId(session.getSessionId())
                    .amount(amount)
                    .paymentMethod(Transaction.PaymentMethod.VNPAY)
                    .status(Transaction.Status.PENDING)
                    .message("Đang chuyển hướng đến cổng thanh toán VNPay")
                    .paymentUrl(paymentUrl)
                    .createdAt(LocalDateTime.now())
                    .build();
        }

        throw new RuntimeException("Phương thức thanh toán không được hỗ trợ");
    }

    @Override
    @Transactional
    public PaymentResponseDTO processCashPayment(Long sessionId, Long userId) {
        log.info("Xử lý thanh toán tiền mặt - Session: {}, User: {}", sessionId, userId);

        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy phiên sạc"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy người dùng"));

        BigDecimal amount = calculatePaymentAmount(sessionId, userId);

        // Tìm hoặc tạo transaction
        Transaction transaction = transactionRepository
                .findBySessionAndUser(session, user)
                .orElseGet(() -> {
                    Transaction newTrans = new Transaction();
                    newTrans.setSession(session);
                    newTrans.setUser(user);
                    newTrans.setAmount(amount.doubleValue());
                    newTrans.setPaymentMethod(Transaction.PaymentMethod.CASH);
                    newTrans.setStatus(Transaction.Status.PENDING);
                    return transactionRepository.save(newTrans);
                });

        // Cập nhật trạng thái thành công
        transaction.setStatus(Transaction.Status.SUCCESS);
        transactionRepository.save(transaction);

        // Đánh dấu các khoản phí đã thanh toán
        List<Fee> fees = feeCalculationService.getSessionFees(sessionId);
        fees.forEach(fee -> {
            fee.setIsPaid(true);
            feeRepository.save(fee);
        });

        // Gửi notification
        notificationService.createPaymentNotification(
                userId,
                NotificationServiceImpl.PaymentEvent.PAYMENT_SUCCESS,
                amount.doubleValue(),
                "Thanh toán bằng tiền mặt thành công"
        );

        // Gửi hóa đơn qua email
        sendInvoiceEmail(transaction.getTransactionId());

        PaymentDetailDTO paymentDetail = getPaymentDetail(sessionId, userId);

        return PaymentResponseDTO.builder()
                .transactionId(transaction.getTransactionId())
                .sessionId(sessionId)
                .amount(amount)
                .paymentMethod(Transaction.PaymentMethod.CASH)
                .status(Transaction.Status.SUCCESS)
                .message("Thanh toán tiền mặt thành công")
                .createdAt(LocalDateTime.now())
                .paymentDetail(paymentDetail)
                .build();
    }

    @Override
    @Transactional
    public void completePayment(Long transactionId) {
        log.info("Hoàn tất thanh toán cho transaction: {}", transactionId);

        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy giao dịch"));

        transaction.setStatus(Transaction.Status.SUCCESS);
        transactionRepository.save(transaction);

        // Đánh dấu các khoản phí đã thanh toán
        List<Fee> fees = feeCalculationService.getSessionFees(transaction.getSession().getSessionId());
        fees.forEach(fee -> {
            fee.setIsPaid(true);
            feeRepository.save(fee);
        });

        // Gửi notification
        notificationService.createPaymentNotification(
                transaction.getUser().getUserId(),
                NotificationServiceImpl.PaymentEvent.PAYMENT_SUCCESS,
                transaction.getAmount(),
                "Thanh toán thành công qua " + transaction.getPaymentMethod()
        );

        // Gửi hóa đơn
        sendInvoiceEmail(transactionId);
    }

    @Override
    @Transactional
    public void handleFailedPayment(Long transactionId, String reason) {
        log.error("Thanh toán thất bại cho transaction: {}, lý do: {}", transactionId, reason);

        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy giao dịch"));

        transaction.setStatus(Transaction.Status.FAILED);
        transactionRepository.save(transaction);

        // Gửi notification
        notificationService.createPaymentNotification(
                transaction.getUser().getUserId(),
                NotificationServiceImpl.PaymentEvent.PAYMENT_FAILED,
                transaction.getAmount(),
                reason != null ? reason : "Thanh toán thất bại"
        );
    }

    @Override
    public void sendInvoiceEmail(Long transactionId) {
        log.info("Đang gửi hóa đơn qua email cho transaction: {}", transactionId);

        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy giao dịch"));

        if (transaction.getStatus() != Transaction.Status.SUCCESS) {
            log.warn("Giao dịch chưa thành công, không gửi hóa đơn");
            return;
        }

        User user = transaction.getUser();
        if (user.getEmail() == null || user.getEmail().isEmpty()) {
            log.warn("Người dùng không có email, không thể gửi hóa đơn");
            return;
        }

        PaymentDetailDTO paymentDetail = getPaymentDetail(
                transaction.getSession().getSessionId(),
                user.getUserId()
        );

        paymentDetail.setPaymentMethod(transaction.getPaymentMethod().toString());
        paymentDetail.setTransactionId(transaction.getTransactionId().toString());
        paymentDetail.setPaymentTime(LocalDateTime.now());

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(user.getEmail());
            helper.setSubject("Hóa đơn thanh toán phiên sạc #" + transaction.getSession().getSessionId());
            helper.setText(buildInvoiceEmailTemplate(paymentDetail), true);

            mailSender.send(message);
            log.info("Đã gửi hóa đơn thành công đến: {}", user.getEmail());
        } catch (MessagingException e) {
            log.error("Lỗi khi gửi hóa đơn qua email: {}", e.getMessage());
            throw new RuntimeException("Không thể gửi hóa đơn qua email", e);
        }
    }

    /**
     * Tạo template HTML cho email hóa đơn
     */
    private String buildInvoiceEmailTemplate(PaymentDetailDTO detail) {
        StringBuilder feesHtml = new StringBuilder();
        if (detail.getFees() != null && !detail.getFees().isEmpty()) {
            for (FeeDetailDTO fee : detail.getFees()) {
                feesHtml.append(String.format(
                        "<tr><td>%s</td><td style='text-align: right;'>%,.0f VNĐ</td></tr>",
                        fee.getDescription(),
                        fee.getAmount()
                ));
            }
        } else {
            feesHtml.append("<tr><td colspan='2' style='text-align: center;'>Không có phí phát sinh</td></tr>");
        }

        return String.format("""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
        }
        .content { 
            background: #f9f9f9; 
            padding: 30px; 
            border-radius: 0 0 10px 10px; 
        }
        .invoice-box { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.1); 
        }
        table { width: 100%%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f0f0f0; font-weight: bold; }
        .total { font-size: 18px; font-weight: bold; color: #667eea; }
        .footer { 
            text-align: center; 
            margin-top: 20px; 
            color: #666; 
            font-size: 12px; 
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>HÓA ĐƠN THANH TOÁN</h1>
            <p>EV Charging Station Management</p>
        </div>
        <div class="content">
            <div class="invoice-box">
                <h2>Thông tin khách hàng</h2>
                <p><strong>Họ tên:</strong> %s</p>
                <p><strong>Email:</strong> %s</p>
                
                <h2>Thông tin trạm sạc</h2>
                <p><strong>Tên trạm:</strong> %s</p>
                <p><strong>Địa chỉ:</strong> %s</p>
                
                <h2>Thông tin phiên sạc</h2>
                <table>
                    <tr>
                        <td><strong>Thời gian bắt đầu:</strong></td>
                        <td>%s</td>
                    </tr>
                    <tr>
                        <td><strong>Thời gian kết thúc:</strong></td>
                        <td>%s</td>
                    </tr>
                    <tr>
                        <td><strong>Lượng điện tiêu thụ:</strong></td>
                        <td>%,.2f kWh</td>
                    </tr>
                </table>
                
                <h2>Chi tiết thanh toán</h2>
                <table>
                    <tr>
                        <td><strong>Giá cơ bản:</strong></td>
                        <td style='text-align: right;'>%,.0f VNĐ/kWh</td>
                    </tr>
                    <tr>
                        <td><strong>Hệ số giá:</strong></td>
                        <td style='text-align: right;'>×%,.2f</td>
                    </tr>
                    <tr>
                        <td><strong>Giảm giá gói:</strong></td>
                        <td style='text-align: right;'>-%,.0f%%</td>
                    </tr>
                    <tr style='background-color: #f0f0f0;'>
                        <td><strong>Chi phí cơ bản:</strong></td>
                        <td style='text-align: right;'><strong>%,.0f VNĐ</strong></td>
                    </tr>
                </table>
                
                <h2>Phí phát sinh</h2>
                <table>
                    %s
                    <tr style='background-color: #f0f0f0;'>
                        <td><strong>Tổng phí:</strong></td>
                        <td style='text-align: right;'><strong>%,.0f VNĐ</strong></td>
                    </tr>
                </table>
                
                <table>
                    <tr class='total'>
                        <td>TỔNG THANH TOÁN:</td>
                        <td style='text-align: right;'>%,.0f VNĐ</td>
                    </tr>
                </table>
                
                <h2>Thông tin thanh toán</h2>
                <p><strong>Phương thức:</strong> %s</p>
                <p><strong>Mã giao dịch:</strong> %s</p>
                <p><strong>Thời gian thanh toán:</strong> %s</p>
                <p style='color: #4CAF50; font-weight: bold;'>✓ Thanh toán thành công</p>
            </div>
            
            <p style='text-align: center; color: #666;'>
                Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!
            </p>
        </div>
        <div class="footer">
            <p>© 2025 EV Charging Station Management. All rights reserved.</p>
            <p>Email này được gửi tự động, vui lòng không trả lời.</p>
        </div>
    </div>
</body>
</html>
""",
                detail.getUserName(),
                detail.getUserEmail(),
                detail.getStationName(),
                detail.getStationAddress(),
                detail.getSessionStartTime(),
                detail.getSessionEndTime(),
                detail.getPowerConsumed(),
                detail.getBasePrice(),
                detail.getPriceFactor(),
                detail.getSubscriptionDiscount().multiply(new BigDecimal("100")),
                detail.getBaseCost(),
                feesHtml.toString(),
                detail.getTotalFees(),
                detail.getTotalAmount(),
                detail.getPaymentMethod(),
                detail.getTransactionId(),
                detail.getPaymentTime()
        );
    }

    @Override
    public Transaction getTransaction(Long transactionId) {
        return transactionRepository.findById(transactionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy giao dịch với ID: " + transactionId));
    }
}