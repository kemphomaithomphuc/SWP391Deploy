package swp391.code.swp391.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import swp391.code.swp391.entity.User;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private Long userId;
    private String username;
    private String fullName;
    private String email;
    private String phoneNumber;
    private String address;
    private User.UserRole role;
    private User.UserStatus status;

    // Danh sách xe của user
    private List<VehicleDTO> vehicles;

    // Constructor từ User entity
    public UserDTO(User user) {
        this.userId = user.getUserId();
        this.username = user.getFullName();
        this.fullName = user.getFullName();
        this.email = user.getEmail();
        this.phoneNumber = user.getPhone();
        this.address = user.getAddress();
        this.role = user.getRole();
        this.status = user.getStatus();

    }
    // Constructor từ User entity (có bao gồm vehicles)
    public UserDTO(User user, boolean includeVehicles) {
        this(user); // Gọi constructor trên

        if (includeVehicles && user.getVehicles() != null) {
            this.vehicles = user.getVehicles().stream()
                    .map(VehicleDTO::new)
                    .collect(Collectors.toList());
        }
    }
}