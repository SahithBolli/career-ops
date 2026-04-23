package io.careerops.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class JobScoreRequest {

    @NotBlank(message = "Job URL is required")
    private String jobUrl;

    private String jdText;

    private String company;

    private String role;

    private String location;

    private String salaryRange;

    private Integer yearsRequired;

    private Boolean mentionsSponsor;
}
