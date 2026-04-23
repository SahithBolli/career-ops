package io.careerops.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.careerops.dto.ApplicationRequest;
import io.careerops.dto.JobScoreRequest;
import io.careerops.model.Application;
import io.careerops.model.ApplicationStatus;
import io.careerops.model.JobScore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class JobImportService {

    private final WebClient.Builder webClientBuilder;
    private final JobScoringService jobScoringService;
    private final ApplicationService applicationService;
    private final ObjectMapper objectMapper;

    @Value("${anthropic.api-key:}")
    private String anthropicKey;

    @Value("${apify.api-token:}")
    private String apifyToken;

    public Application importFromUrl(String jobUrl) {
        log.info("Importing job from URL: {}", jobUrl);

        String pageText = fetchPageText(jobUrl);
        JobScoreRequest extracted = extractWithClaude(pageText, jobUrl);
        JobScore score = jobScoringService.score(extracted);

        ApplicationRequest req = new ApplicationRequest();
        req.setCompany(extracted.getCompany() != null ? extracted.getCompany() : "Unknown");
        req.setRole(extracted.getRole() != null ? extracted.getRole() : "Software Engineer");
        req.setJobUrl(jobUrl);
        req.setLocation(extracted.getLocation());
        req.setSalaryRange(extracted.getSalaryRange());
        req.setScore(score.getGlobalScore());
        req.setSponsorshipConfirmed(Boolean.TRUE.equals(score.getSponsorsH1b()));
        req.setStatus(ApplicationStatus.EVALUATED);
        req.setNotes("AI imported. Score: " + score.getGlobalScore() + "/5. " + score.getRecommendation());

        try {
            return applicationService.create(req);
        } catch (IllegalArgumentException e) {
            // Already exists — return existing
            return applicationService.findAll().stream()
                .filter(a -> jobUrl.equals(a.getJobUrl()))
                .findFirst()
                .orElseThrow(() -> e);
        }
    }

    private String fetchPageText(String url) {
        if (apifyToken == null || apifyToken.isBlank()) {
            log.warn("No Apify token — returning placeholder text");
            return "Job posting at " + url;
        }
        try {
            String apifyUrl = "https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items"
                + "?token=" + apifyToken + "&query=" + java.net.URLEncoder.encode(url, "UTF-8") + "&maxResults=1";

            String response = webClientBuilder.build()
                .get()
                .uri(apifyUrl)
                .retrieve()
                .bodyToMono(String.class)
                .block(java.time.Duration.ofSeconds(60));

            JsonNode arr = objectMapper.readTree(response);
            if (arr.isArray() && arr.size() > 0) {
                JsonNode item = arr.get(0);
                String text = item.path("text").asText("");
                if (!text.isBlank()) return text.substring(0, Math.min(text.length(), 8000));
                return item.path("markdown").asText(url);
            }
        } catch (Exception e) {
            log.error("Apify fetch failed: {}", e.getMessage());
        }
        return "Job posting URL: " + url;
    }

    private JobScoreRequest extractWithClaude(String pageText, String jobUrl) {
        JobScoreRequest req = new JobScoreRequest();
        req.setJobUrl(jobUrl);

        if (anthropicKey == null || anthropicKey.isBlank()) {
            log.warn("No Anthropic key — skipping AI extraction");
            return req;
        }

        String prompt = """
            Extract job details from this job posting text. Return ONLY valid JSON with these fields:
            {
              "company": "company name",
              "role": "job title",
              "location": "city, state or Remote",
              "salaryRange": "$XXK-$XXK or null",
              "yearsRequired": number or null,
              "jdText": "first 2000 chars of the full job description"
            }

            Job posting:
            """ + pageText.substring(0, Math.min(pageText.length(), 6000));

        try {
            Map<String, Object> body = Map.of(
                "model", "claude-haiku-4-5-20251001",
                "max_tokens", 800,
                "messages", List.of(Map.of("role", "user", "content", prompt))
            );

            String response = webClientBuilder.build()
                .post()
                .uri("https://api.anthropic.com/v1/messages")
                .header("x-api-key", anthropicKey)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .block(java.time.Duration.ofSeconds(30));

            JsonNode root = objectMapper.readTree(response);
            String text = root.path("content").get(0).path("text").asText();

            // Extract JSON from response
            int start = text.indexOf('{');
            int end = text.lastIndexOf('}') + 1;
            if (start >= 0 && end > start) {
                JsonNode extracted = objectMapper.readTree(text.substring(start, end));
                req.setCompany(nullIfBlank(extracted.path("company").asText()));
                req.setRole(nullIfBlank(extracted.path("role").asText()));
                req.setLocation(nullIfBlank(extracted.path("location").asText()));
                req.setSalaryRange(nullIfBlank(extracted.path("salaryRange").asText()));
                if (!extracted.path("yearsRequired").isNull() && extracted.path("yearsRequired").isNumber()) {
                    req.setYearsRequired(extracted.path("yearsRequired").asInt());
                }
                req.setJdText(nullIfBlank(extracted.path("jdText").asText()));
            }
        } catch (Exception e) {
            log.error("Claude extraction failed: {}", e.getMessage());
        }
        return req;
    }

    private String nullIfBlank(String s) {
        return (s == null || s.isBlank() || s.equals("null")) ? null : s;
    }
}
