package io.careerops.dto;

import io.careerops.model.SponsorCompany;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class SponsorCheckResponse {

    private String companyName;
    private boolean knownSponsor;
    private SponsorCompany.SponsorTier tier;
    private Integer totalH1bApprovals;
    private String state;
    private String recommendation;
    private List<String> similarCompanies;
}
