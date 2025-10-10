package swp391.code.swp391.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "IssueReport")
@NoArgsConstructor
@AllArgsConstructor
public class IssueReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long issueReportId;

    @ManyToOne
    @JoinColumn(name = "station_id", nullable = false)
    private ChargingStation station;

    @ManyToOne
    @JoinColumn(name = "staff_id", nullable = false)
    private User staff;

    @Column(nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.INBOX;

    private LocalDateTime reportedTime;

    public enum Status {
        INBOX, IN_PROGRESS, RESOLVED
    }
}
