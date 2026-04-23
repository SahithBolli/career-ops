package io.careerops.service;

import io.careerops.dto.JobScoreRequest;
import io.careerops.dto.SponsorCheckResponse;
import io.careerops.model.JobScore;
import io.careerops.model.SponsorCompany;
import io.careerops.repository.JobScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class JobScoringService {

    private final JobScoreRepository jobScoreRepository;
    private final SponsorCheckService sponsorCheckService;
    private final JobLevelClassifier levelClassifier;

    // Candidate profile (read from config in production, hardcoded for demo)
    private static final int CANDIDATE_YEARS_EXP = 6;
    private static final List<String> CORE_SKILLS = List.of(
        "java", "spring boot", "spring cloud", "spring", "microservices",
        "rest api", "restful", "kafka", "aws", "kubernetes", "helm",
        "docker", "jenkins", "ci/cd", "postgresql", "mongodb", "dynamodb",
        "react", "oauth2", "spring security", "junit", "mockito", "terraform"
    );

    public List<JobScore> getTopJobs(Double minScore) {
        return jobScoreRepository.findByLevelExcludedFalseAndGlobalScoreGreaterThanEqualOrderByGlobalScoreDesc(minScore);
    }

    public List<JobScore> getSponsoredJobs() {
        return jobScoreRepository.findSponsoredHighScoreJobs();
    }

    public JobScore score(JobScoreRequest request) {
        Optional<JobScore> existing = jobScoreRepository.findByJobUrl(request.getJobUrl());
        if (existing.isPresent()) {
            log.info("Returning cached score for {}", request.getJobUrl());
            return existing.get();
        }

        JobScore score = new JobScore();
        score.setJobUrl(request.getJobUrl());
        score.setCompany(request.getCompany());
        score.setRole(request.getRole());

        List<String> redFlags = new ArrayList<>();

        // 1. Level classification
        String levelLabel = levelClassifier.getLevelLabel(request.getRole());
        boolean excluded = !levelClassifier.isAllowed(request.getRole());
        score.setLevelClassification(levelLabel);
        score.setLevelExcluded(excluded);

        if (excluded) {
            String reason = levelClassifier.getExclusionReason(request.getRole());
            redFlags.add(reason);
            score.setRedFlags(redFlags);
            score.setGlobalScore(1.5);
            score.setRecommendation("SKIP — Role is above target level (Entry/Mid/Senior only). " + reason);
            return jobScoreRepository.save(score);
        }

        // 2. Years of experience check
        double cvScore = 3.5;
        if (request.getYearsRequired() != null) {
            int gap = request.getYearsRequired() - CANDIDATE_YEARS_EXP;
            if (gap <= 0) cvScore = Math.min(5.0, cvScore + 0.5);
            else if (gap == 1) cvScore = 3.0;
            else if (gap == 2) cvScore -= 0.5;
            else { cvScore = 2.0; redFlags.add("Years gap: " + gap + " years short of requirement"); }
        }

        // 3. Skill match from JD text
        if (request.getJdText() != null) {
            String jdLower = request.getJdText().toLowerCase();
            long matched = CORE_SKILLS.stream().filter(jdLower::contains).count();
            double matchRatio = (double) matched / CORE_SKILLS.size();
            cvScore = Math.min(5.0, cvScore + (matchRatio * 1.5));

            List<String> keywords = CORE_SKILLS.stream().filter(jdLower::contains).toList();
            score.setExtractedKeywords(keywords);
        }
        score.setCvMatchScore(cvScore);

        // 4. Compensation score
        double compScore = 3.5;
        if (request.getSalaryRange() != null) {
            String salary = request.getSalaryRange().replaceAll("[^0-9,]", "");
            compScore = salary.isEmpty() ? 3.0 : 4.0;
        }
        score.setCompScore(compScore);

        // 5. Sponsorship score
        double visaScore = 3.5;
        boolean sponsorsH1b = false;
        if (request.getCompany() != null) {
            SponsorCheckResponse sponsorCheck = sponsorCheckService.check(request.getCompany());
            sponsorsH1b = sponsorCheck.isKnownSponsor();
            score.setSponsorshipKnown(true);
            score.setSponsorsH1b(sponsorsH1b);

            if (sponsorsH1b) {
                visaScore = sponsorCheck.getTier() == SponsorCompany.SponsorTier.HIGH ? 5.0 : 4.0;
            } else if (request.getJdText() != null && sponsorCheckService.jdMentionsNoSponsorship(request.getJdText())) {
                visaScore = 1.0;
                redFlags.add("JD explicitly states no sponsorship — STEM OPT/H-1B blocker");
            } else {
                visaScore = 3.0;
            }
        }
        score.setVisaScore(visaScore);

        // 6. Global score (weighted)
        double global = (cvScore * 0.40) + (compScore * 0.20) + (visaScore * 0.25) + (3.5 * 0.15);
        global = Math.min(5.0, Math.max(1.0, global));
        score.setGlobalScore(Math.round(global * 10.0) / 10.0);
        score.setRedFlags(redFlags);

        // 7. Recommendation
        if (visaScore == 1.0) {
            score.setRecommendation("SKIP — Sponsorship blocker. JD explicitly says no sponsorship.");
        } else if (global >= 4.5) {
            score.setRecommendation("APPLY NOW — Strong match. High sponsor confidence.");
        } else if (global >= 4.0) {
            score.setRecommendation("APPLY — Good match. Verify sponsorship willingness during recruiter screen.");
        } else if (global >= 3.5) {
            score.setRecommendation("CONSIDER — Decent match but gaps exist. Apply only if sponsorship confirmed.");
        } else {
            score.setRecommendation("SKIP — Below threshold. Too many gaps.");
        }

        return jobScoreRepository.save(score);
    }
}
