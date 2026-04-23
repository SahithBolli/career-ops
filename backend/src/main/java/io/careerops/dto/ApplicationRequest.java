package io.careerops.dto;

import io.careerops.model.ApplicationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class ApplicationRequest {

    @NotBlank(message = "Company name is required")
    private String company;

    @NotBlank(message = "Role is required")
    private String role;

    @NotNull(message = "Status is required")
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
}
