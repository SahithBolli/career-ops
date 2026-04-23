package io.careerops.controller;

import io.careerops.dto.JobScoreRequest;
import io.careerops.model.Application;
import io.careerops.model.JobScore;
import io.careerops.service.JobImportService;
import io.careerops.service.JobLevelClassifier;
import io.careerops.service.JobScoringService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
@Tag(name = "Job Scoring", description = "Score job postings against candidate profile with level and sponsorship filters")
@CrossOrigin(origins = "*")
public class JobController {

    private final JobScoringService jobScoringService;
    private final JobLevelClassifier levelClassifier;
    private final JobImportService jobImportService;

    @PostMapping("/score")
    @Operation(summary = "Score a job posting",
               description = "Scores a JD against the candidate profile. Auto-filters Lead/Manager/Director. Checks H-1B sponsorship. Returns 1-5 score with recommendation.")
    public ResponseEntity<JobScore> score(@Valid @RequestBody JobScoreRequest request) {
        return ResponseEntity.ok(jobScoringService.score(request));
    }

    @GetMapping("/check-level")
    @Operation(summary = "Check if a job title is within allowed seniority levels",
               description = "Returns whether the title is Entry/Mid/Senior (allowed) or Lead/Manager/Director+ (excluded)")
    public ResponseEntity<Map<String, Object>> checkLevel(@RequestParam String title) {
        boolean allowed = levelClassifier.isAllowed(title);
        String level = levelClassifier.getLevelLabel(title);
        String reason = levelClassifier.getExclusionReason(title);
        return ResponseEntity.ok(Map.of(
            "title", title,
            "level", level,
            "allowed", allowed,
            "reason", reason != null ? reason : "Within target level range"
        ));
    }

    @GetMapping("/top")
    @Operation(summary = "Get top-scored jobs", description = "Returns all scored jobs above a minimum score threshold")
    public ResponseEntity<List<JobScore>> getTop(@RequestParam(defaultValue = "4.0") Double minScore) {
        return ResponseEntity.ok(jobScoringService.getTopJobs(minScore));
    }

    @GetMapping("/sponsored")
    @Operation(summary = "Get top sponsored jobs", description = "Returns all scored jobs where H-1B sponsorship is confirmed, ordered by score")
    public ResponseEntity<List<JobScore>> getSponsored() {
        return ResponseEntity.ok(jobScoringService.getSponsoredJobs());
    }

    @PostMapping("/import-url")
    @Operation(summary = "AI import a job from URL",
               description = "Fetches the job page via Apify, extracts details with Claude AI, scores it, and saves to your application tracker automatically.")
    public ResponseEntity<Application> importFromUrl(@RequestBody Map<String, String> body) {
        String url = body.get("url");
        if (url == null || url.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(jobImportService.importFromUrl(url));
    }
}
