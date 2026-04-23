package io.careerops.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "applications")
@Data
@NoArgsConstructor
public class Application {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    private String company;

    @NotBlank
    private String role;

    @Enumerated(EnumType.STRING)
    @NotNull
    private ApplicationStatus status;

    private Double score;

    private String salaryRange;

    private String location;

    private Boolean remoteOk;

    private Boolean sponsorshipConfirmed;

    private String jobUrl;

    private String reportPath;

    private String pdfPath;

    private String notes;

    private LocalDate appliedDate;

    private LocalDate deadlineDate;

    private LocalDate lastActivityDate;

    @Column(columnDefinition = "TEXT")
    private String coverLetter;

    @Column(columnDefinition = "TEXT")
    private String resumeBase64;

    private String resumeFileName;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (appliedDate == null) appliedDate = LocalDate.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
        lastActivityDate = LocalDate.now();
    }
}
