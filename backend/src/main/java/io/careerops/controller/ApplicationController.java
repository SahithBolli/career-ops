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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    @GetMapping("/analytics")
    @Operation(summary = "Pipeline analytics", description = "Returns response rates, interview rates, deadline alerts, and STEM OPT stats")
    public ResponseEntity<AnalyticsResponse> analytics() {
        return ResponseEntity.ok(applicationService.getAnalytics());
    }
}
