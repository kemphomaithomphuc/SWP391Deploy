package swp391.code.swp391.dto;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderRequestDTO {

    @NotNull(message = "User ID không được để trống")
    private Long userId;

    @NotNull(message = "Vehicle ID không được để trống")
    private Long vehicleId;

    @NotNull(message = "Station ID không được để trống")
    private Long stationId;

    @NotNull(message = "Dung lượng pin hiện tại không được để trống")
    @DecimalMin(value = "0.0", message = "Pin hiện tại phải >= 0%")
    @DecimalMax(value = "100.0", message = "Pin hiện tại phải <= 100%")
    private Double currentBattery; // % pin hiện tại

    @NotNull(message = "Dung lượng pin mong muốn không được để trống")
    @DecimalMin(value = "0.0", message = "Pin mong muốn phải >= 0%")
    @DecimalMax(value = "100.0", message = "Pin mong muốn phải <= 100%")
    private Double targetBattery; // % pin mong muốn


}