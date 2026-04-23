package io.careerops.controller;

import io.careerops.dto.AnalyticsResponse;
import io.careerops.dto.ApplicationRequest;
import io.careerops.model.Application;
import io.careerops.model.ApplicationStatus;
import io.careerops.service.ApplicationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Base64;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/applications")
@RequiredArgsConstructor
@Tag(name = "Applications", description = "Job application tracker — create, update, and analyze your pipeline")
@CrossOrigin(origins = "*")
public class ApplicationController {

    private final ApplicationService applicationService;

    @GetMapping
    @Operation(summary = "List all applications", description = "Returns all applications ordered by date")
    public ResponseEntity<List<Application>> getAll() {
        return ResponseEntity.ok(applicationService.findAll());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get application by ID")
    public ResponseEntity<Application> getById(@PathVariable Long id) {
        return ResponseEntity.ok(applicationService.findById(id));
    }

    @GetMapping("/status/{status}")
    @Operation(summary = "Filter by status", description = "Valid statuses: EVALUATED, APPLIED, RESPONDED, INTERVIEW, OFFER, REJECTED, DISCARDED, SKIP")
    public ResponseEntity<List<Application>> getByStatus(@PathVariable ApplicationStatus status) {
        return ResponseEntity.ok(applicationService.findByStatus(status));
    }

    @PostMapping
    @Operation(summary = "Add a new application")
    public ResponseEntity<Application> create(@Valid @RequestBody ApplicationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(applicationService.create(req));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing application")
    public ResponseEntity<Application> update(@PathVariable Long id, @Valid @RequestBody ApplicationRequest req) {
        return ResponseEntity.ok(applicationService.update(id, req));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update application status only")
    public ResponseEntity<Application> updateStatus(
            @PathVariable Long id,
            @RequestParam ApplicationStatus status) {
        return ResponseEntity.ok(applicationService.updateStatus(id, status));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete an application")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        applicationService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/resume")
    @Operation(summary = "Upload tailored resume (Base64 PDF)")
    public ResponseEntity<Application> uploadResume(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.uploadResume(id, body.get("base64"), body.get("fileName")));
    }

    @GetMapping("/{id}/resume")
    @Operation(summary = "Download resume PDF")
    public ResponseEntity<byte[]> downloadResume(@PathVariable Long id) {
        Application app = applicationService.findById(id);
        if (app.getResumeBase64() == null) return ResponseEntity.notFound().build();
        byte[] pdf = Base64.getDecoder().decode(app.getResumeBase64());
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + (app.getResumeFileName() != null ? app.getResumeFileName() : "resume.pdf") + "\"")
            .contentType(MediaType.APPLICATION_PDF)
            .body(pdf);
    }

    @DeleteMapping("/{id}/resume")
    @Operation(summary = "Delete stored resume")
    public ResponseEntity<Application> deleteResume(@PathVariable Long id) {
        return ResponseEntity.ok(applicationService.deleteResume(id));
    }

    @PostMapping("/{id}/cover")
    @Operation(summary = "Upload cover letter text")
    public ResponseEntity<Application> uploadCover(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(applicationService.uploadCover(id, body.get("text")));
    }

    @DeleteMapping("/{id}/cover")
    @Operation(summary = "Delete stored cover letter")
    public ResponseEntity<Application> deleteCover(@PathVariable Long id) {
        return ResponseEntity.ok(applicationService.deleteCover(id));
    }

    @GetMapping("/analytics")
    @Operation(summary = "Pipeline analytics", description = "Returns response rates, interview rates, deadline alerts, and STEM OPT stats")
    public ResponseEntity<AnalyticsResponse> analytics() {
        return ResponseEntity.ok(applicationService.getAnalytics());
    }
}
