package swp391.code.swp391.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO cho MỘT khoảng thời gian trống CÓ ĐỦ để sạc
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AvailableTimeSlotDTO {

    //private Long chargingPointId;
    //private String connectorTypeName;
    //private Double chargingPower; // kW
    //private Double pricePerKwh; // VND/kWh

    // Khoảng thời gian TRỐNG
    private LocalDateTime freeFrom; // Bắt đầu khoảng trống
    private LocalDateTime freeTo;   // Kết thúc khoảng trống
    private Integer availableMinutes; // Tổng số phút trống trong gap này

    // Thời gian cần thiết để sạc
    private Integer requiredMinutes; // Số phút CẦN để sạc đầy

    // Chi phí ước tính
    private Double estimatedCost; // VND (energyToCharge × pricePerKwh)
}
