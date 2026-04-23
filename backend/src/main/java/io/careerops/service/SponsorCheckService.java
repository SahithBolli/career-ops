package io.careerops.service;

import io.careerops.dto.SponsorCheckResponse;
import io.careerops.model.SponsorCompany;
import io.careerops.repository.SponsorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SponsorCheckService {

    private final SponsorRepository sponsorRepository;

    // Well-known large sponsors not necessarily in DOL CSV
    private static final List<String> KNOWN_MEGA_SPONSORS = List.of(
        "amazon", "google", "microsoft", "meta", "apple", "salesforce",
        "servicenow", "workday", "oracle", "ibm", "accenture", "cognizant",
        "infosys", "wipro", "tcs", "tata", "capgemini", "deloitte",
        "jpmorgan", "capital one", "american express", "goldman sachs",
        "wells fargo", "bank of america", "stripe", "paypal", "square",
        "twilio", "databricks", "snowflake", "confluent", "palantir",
        "honeywell", "siemens", "ge", "general electric", "bosch",
        "qualcomm", "intel", "nvidia", "amd", "cisco", "vmware"
    );

    private static final List<String> NO_SPONSORSHIP_SIGNALS = List.of(
        "us citizens only", "no sponsorship", "must be authorized",
        "without sponsorship", "green card", "permanent resident only",
        "security clearance required"
    );

    public SponsorCheckResponse check(String companyName) {
        String normalized = companyName.toLowerCase().trim();

        // 1. Check DOL database
        Optional<SponsorCompany> dbMatch = sponsorRepository.findByNameExact(companyName);
        if (dbMatch.isEmpty()) {
            List<SponsorCompany> fuzzyMatches = sponsorRepository.searchByName(
                normalized.length() > 5 ? normalized.substring(0, 5) : normalized
            );
            if (!fuzzyMatches.isEmpty()) {
                dbMatch = Optional.of(fuzzyMatches.get(0));
            }
        }

        // 2. Check known mega-sponsors list
        boolean isMegaSponsor = KNOWN_MEGA_SPONSORS.stream()
            .anyMatch(s -> normalized.contains(s) || s.contains(normalized));

        if (dbMatch.isPresent()) {
            SponsorCompany sponsor = dbMatch.get();
            List<SponsorCompany> similar = sponsorRepository.searchByName(
                normalized.length() > 3 ? normalized.substring(0, 3) : normalized
            );
            return SponsorCheckResponse.builder()
                .companyName(companyName)
                .knownSponsor(true)
                .tier(sponsor.getTier())
                .totalH1bApprovals(sponsor.getTotalApprovals())
                .state(sponsor.getState())
                .recommendation(buildRecommendation(sponsor.getTier(), true))
                .similarCompanies(similar.stream().map(SponsorCompany::getCompanyName).limit(3).toList())
                .build();
        }

        if (isMegaSponsor) {
            return SponsorCheckResponse.builder()
                .companyName(companyName)
                .knownSponsor(true)
                .tier(SponsorCompany.SponsorTier.HIGH)
                .recommendation("Known large employer — very likely to sponsor H-1B. Confirm during recruiter screen.")
                .build();
        }

        return SponsorCheckResponse.builder()
            .companyName(companyName)
            .knownSponsor(false)
            .tier(null)
            .recommendation("Not found in H-1B sponsor database. Ask recruiter directly: 'Does your company sponsor H-1B visas?'")
            .build();
    }

    public boolean jdMentionsNoSponsorship(String jdText) {
        if (jdText == null) return false;
        String lower = jdText.toLowerCase();
        return NO_SPONSORSHIP_SIGNALS.stream().anyMatch(lower::contains);
    }

    public boolean jdExplicitlySponsor(String jdText) {
        if (jdText == null) return false;
        String lower = jdText.toLowerCase();
        return lower.contains("sponsor") && (lower.contains("h-1b") || lower.contains("h1b") || lower.contains("visa"));
    }

    private String buildRecommendation(SponsorCompany.SponsorTier tier, boolean known) {
        return switch (tier) {
            case HIGH -> "Strong H-1B sponsor (50+ approvals/year). Safe to apply — confirm sponsorship timeline in recruiter screen.";
            case MEDIUM -> "Active H-1B sponsor (10-49 approvals/year). Mention STEM OPT status early and confirm willingness to file H-1B.";
            case LOW -> "Limited H-1B history (<10 approvals/year). Verify sponsorship ability before investing time in application process.";
        };
    }
}
