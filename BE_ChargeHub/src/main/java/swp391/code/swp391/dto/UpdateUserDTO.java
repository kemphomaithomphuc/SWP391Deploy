package swp391.code.swp391.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.sql.Date;

/**
 * DTO cho việc cập nhật thông tin cơ bản của user và thay đổi mật khẩu
 * Chỉ bao gồm những thông tin an toàn, không cần xác thực
 */
@Setter
@Getter
public class UpdateUserDTO {

    // Getters và Setters
    //@NotBlank(message = "Họ tên không được để trống")
    @Size(min = 2, max = 100, message = "Họ tên phải từ 2-100 ký tự")
    private String fullName;

    @Size(max = 500, message = "Địa chỉ không quá 500 ký tự")
    private String address;

    /**
     * Ngày sinh phải là ngày trong quá khứ (nếu có)
     * Có thể null nếu người dùng không muốn cung cấp
     */
    @Past(message = "Ngày sinh phải là ngày trong quá khứ")
    private Date dateOfBirth;

    /**
     * Mật khẩu cũ để xác thực danh tính người dùng
     * Chỉ cần thiết khi thay đổi mật khẩu
     */
    @Size(min = 6, max = 100, message = "Mật khẩu cũ phải từ 6-100 ký tự")
    private String oldPassword;

    /**
     * Mật khẩu mới để thay đổi
     * Chỉ cần thiết khi thay đổi mật khẩu
     */
    @Size(min = 6, max = 100, message = "Mật khẩu mới phải từ 6-100 ký tự")
    private String newPassword;

    /**
     * Nhập lại mật khẩu mới để xác nhận
     * Chỉ cần thiết khi thay đổi mật khẩu
     */
    @Size(min = 6, max = 100, message = "Nhập lại mật khẩu mới phải từ 6-100 ký tự")
    private String confirmNewPassword;

    @AssertTrue(message = "Mật khẩu mới và xác nhận mật khẩu không khớp")



    // Constructor rỗng
    public UpdateUserDTO() {}

    // Constructor đầy đủ
    public UpdateUserDTO(String fullName, String address, Date dateOfBirth,
                         String oldPassword, String newPassword, String confirmNewPassword) {
        this.fullName = fullName;
        this.address = address;
        this.dateOfBirth = dateOfBirth;
        this.oldPassword = oldPassword;
        this.newPassword = newPassword;
        this.confirmNewPassword = confirmNewPassword;
    }

//    @Override
//    public String toString() {
//        return "UpdateUserDTO{" +
//                "fullName='" + fullName + '\'' +
//                ", address='" + address + '\'' +
//                ", dateOfBirth=" + dateOfBirth +
//                ", oldPassword='[REDACTED]'" +
//                ", newPassword='[REDACTED]'" +
//                ", confirmNewPassword='[REDACTED]'" +
//                '}';
//    }
}