package io.careerops.service;

import io.careerops.dto.AnalyticsResponse;
import io.careerops.dto.ApplicationRequest;
import io.careerops.model.Application;
import io.careerops.model.ApplicationStatus;
import io.careerops.repository.ApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApplicationService {

    private final ApplicationRepository applicationRepository;

    @Transactional
    public Application create(ApplicationRequest req) {
        if (applicationRepository.existsByCompanyIgnoreCaseAndRoleIgnoreCase(req.getCompany(), req.getRole())) {
            throw new IllegalArgumentException("Application for " + req.getCompany() + " / " + req.getRole() + " already exists. Use PUT to update.");
        }
        Application app = mapToEntity(req, new Application());
        return applicationRepository.save(app);
    }

    @Transactional
    public Application update(Long id, ApplicationRequest req) {
        Application app = applicationRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Application not found: " + id));
        return applicationRepository.save(mapToEntity(req, app));
    }

    public List<Application> findAll() {
        return applicationRepository.findAll();
    }

    public Application findById(Long id) {
        return applicationRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Application not found: " + id));
    }

    public List<Application> findByStatus(ApplicationStatus status) {
        return applicationRepository.findByStatusOrderByAppliedDateDesc(status);
    }

    @Transactional
    public Application updateStatus(Long id, ApplicationStatus status) {
        Application app = findById(id);
        app.setStatus(status);
        return applicationRepository.save(app);
    }

    @Transactional
    public void delete(Long id) {
        applicationRepository.deleteById(id);
    }

    public AnalyticsResponse getAnalytics() {
        List<Application> all = applicationRepository.findAll();
        long total = all.size();

        Map<String, Long> byStatus = applicationRepository.countByStatus().stream()
            .collect(Collectors.toMap(
                row -> row[0].toString(),
                row -> (Long) row[1]
            ));

        double avgScore = applicationRepository.findAverageScore().orElse(0.0);

        long applied = byStatus.getOrDefault("APPLIED", 0L);
        long responded = byStatus.getOrDefault("RESPONDED", 0L) + byStatus.getOrDefault("INTERVIEW", 0L) + byStatus.getOrDefault("OFFER", 0L);
        double responseRate = applied > 0 ? (double) responded / applied * 100 : 0;

        long interviews = byStatus.getOrDefault("INTERVIEW", 0L) + byStatus.getOrDefault("OFFER", 0L);
        double interviewRate = applied > 0 ? (double) interviews / applied * 100 : 0;

        long sponsored = applicationRepository.findSponsoredApplications().size();

        LocalDate today = LocalDate.now();
        LocalDate cutoff = today.plusDays(7);
        List<Application> upcoming = applicationRepository.findUpcomingDeadlines(today, cutoff);
        List<AnalyticsResponse.DeadlineAlert> alerts = upcoming.stream().map(app -> {
            long daysLeft = ChronoUnit.DAYS.between(today, app.getDeadlineDate());
            return AnalyticsResponse.DeadlineAlert.builder()
                .company(app.getCompany())
                .role(app.getRole())
                .deadline(app.getDeadlineDate().toString())
                .daysLeft((int) daysLeft)
                .score(app.getScore() != null ? app.getScore() : 0)
                .build();
        }).toList();

        return AnalyticsResponse.builder()
            .totalApplications((int) total)
            .byStatus(byStatus)
            .averageScore(Math.round(avgScore * 10.0) / 10.0)
            .sponsoredCount((int) sponsored)
            .upcomingDeadlines(upcoming.size())
            .responseRate(Math.round(responseRate * 10.0) / 10.0)
            .interviewRate(Math.round(interviewRate * 10.0) / 10.0)
            .deadlineAlerts(alerts)
            .build();
    }

    private Application mapToEntity(ApplicationRequest req, Application app) {
        app.setCompany(req.getCompany());
        app.setRole(req.getRole());
        app.setStatus(req.getStatus());
        app.setScore(req.getScore());
        app.setSalaryRange(req.getSalaryRange());
        app.setLocation(req.getLocation());
        app.setRemoteOk(req.getRemoteOk());
        app.setSponsorshipConfirmed(req.getSponsorshipConfirmed());
        app.setJobUrl(req.getJobUrl());
        app.setReportPath(req.getReportPath());
        app.setPdfPath(req.getPdfPath());
        app.setNotes(req.getNotes());
        app.setAppliedDate(req.getAppliedDate());
        app.setDeadlineDate(req.getDeadlineDate());
        return app;
    }
}
