package io.careerops.controller;

import io.careerops.dto.SponsorCheckResponse;
import io.careerops.model.SponsorCompany;
import io.careerops.repository.SponsorRepository;
import io.careerops.service.SponsorCheckService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sponsors")
@RequiredArgsConstructor
@Tag(name = "H-1B Sponsors", description = "STEM OPT / H-1B sponsorship database — check if a company sponsors, search by name or state")
@CrossOrigin(origins = "*")
public class SponsorController {

    private final SponsorCheckService sponsorCheckService;
    private final SponsorRepository sponsorRepository;

    @GetMapping("/check")
    @Operation(summary = "Check if a company sponsors H-1B",
               description = "Checks the DOL OFLC database + known mega-sponsor list. Returns tier (HIGH/MEDIUM/LOW) and recommendation.")
    public ResponseEntity<SponsorCheckResponse> check(@RequestParam String company) {
        return ResponseEntity.ok(sponsorCheckService.check(company));
    }

    @GetMapping("/search")
    @Operation(summary = "Search sponsors by company name keyword")
    public ResponseEntity<List<SponsorCompany>> search(@RequestParam String keyword) {
        return ResponseEntity.ok(sponsorRepository.searchByName(keyword));
    }

    @GetMapping("/state/{state}")
    @Operation(summary = "List top H-1B sponsors in a state (e.g., GA, TX, CA)")
    public ResponseEntity<List<SponsorCompany>> byState(@PathVariable String state) {
        return ResponseEntity.ok(sponsorRepository.findByState(state.toUpperCase()));
    }

    @GetMapping("/top")
    @Operation(summary = "List all HIGH-tier H-1B sponsors", description = "Returns companies with 50+ H-1B approvals/year, sorted by volume")
    public ResponseEntity<List<SponsorCompany>> topSponsors() {
        return ResponseEntity.ok(sponsorRepository.findTopSponsors());
    }

    @PostMapping("/check-jd")
    @Operation(summary = "Scan a JD text for sponsorship signals",
               description = "Detects phrases like 'no sponsorship', 'US citizens only', or 'visa sponsorship available'")
    public ResponseEntity<Map<String, Object>> checkJd(@RequestBody Map<String, String> body) {
        String jdText = body.get("jdText");
        boolean noSponsorship = sponsorCheckService.jdMentionsNoSponsorship(jdText);
        boolean explicitSponsor = sponsorCheckService.jdExplicitlySponsor(jdText);

        String signal = noSponsorship ? "NO_SPONSORSHIP" : explicitSponsor ? "SPONSORS" : "SILENT";
        String message = noSponsorship
            ? "JD explicitly states no sponsorship. Skip this role."
            : explicitSponsor
                ? "JD explicitly mentions H-1B sponsorship. Strong positive signal."
                : "JD is silent on sponsorship. Assume large companies sponsor; confirm with recruiter.";

        return ResponseEntity.ok(Map.of(
            "signal", signal,
            "noSponsorshipMentioned", noSponsorship,
            "explicitSponsorMentioned", explicitSponsor,
            "message", message,
            "scoreAdjustment", noSponsorship ? -1.0 : explicitSponsor ? +0.5 : 0.0
        ));
    }
}
