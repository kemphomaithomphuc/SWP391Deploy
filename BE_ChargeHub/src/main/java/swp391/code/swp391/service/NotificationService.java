package swp391.code.swp391.service;

import swp391.code.swp391.entity.Notification;
import swp391.code.swp391.entity.User;
import swp391.code.swp391.service.NotificationServiceImpl.*;

import java.util.List;

public interface NotificationService {

    public void sendNotification(User user, Notification.Type type, String content);

    // ==================== BOOKING NOTIFICATIONS ====================
    void createBookingOrderNotification(Long orderId, NotificationServiceImpl.NotificationEvent event, String additionalInfo);

    // ==================== PAYMENT NOTIFICATIONS ====================
    void createPaymentNotification(Long userId, NotificationServiceImpl.PaymentEvent event, Double amount, String additionalInfo);

    // ==================== ISSUE NOTIFICATIONS ====================
    void createIssueNotification(Long stationId, NotificationServiceImpl.IssueEvent event, String additionalInfo);

    // ==================== PENALTY NOTIFICATIONS ====================
    void createPenaltyNotification(Long orderId, NotificationServiceImpl.PenaltyEvent event, Double penaltyAmount, String reason);

    // ==================== GENERAL NOTIFICATIONS ====================
    void createGeneralNotification(List<Long> userIds, String title, String content);
    void createGeneralNotificationForAllUsers(String title, String content);
}
