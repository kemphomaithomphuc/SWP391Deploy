package swp391.code.swp391.controller;

import com.nimbusds.jose.JOSEException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import swp391.code.swp391.util.JwtUtil;
import swp391.code.swp391.service.NotificationService;

import java.text.ParseException;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final JwtUtil jwtUtil;
    private final NotificationService notificationService;


    //test api for admin
    @GetMapping("/unread/count")
    public ResponseEntity<Long> getUnreadCount(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        String token = jwtUtil.getTokenFromRequestHeader(header);
        Long userId;
        try {
            userId = jwtUtil.getUserIdByTokenDecode(token);
        } catch (ParseException | JOSEException e) {
            throw new RuntimeException(e);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return ResponseEntity.ok(notificationService.getUnreadCountForUser(userId));
    }
}
