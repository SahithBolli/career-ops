package io.careerops.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class AnalyticsResponse {

    private int totalApplications;
    private Map<String, Long> byStatus;
    private double averageScore;
    private int sponsoredCount;
    private int upcomingDeadlines;
    private double responseRate;
    private double interviewRate;
    private List<DeadlineAlert> deadlineAlerts;
    private List<String> topCompanies;

    @Data
    @Builder
    public static class DeadlineAlert {
        private String company;
        private String role;
        private String deadline;
        private int daysLeft;
        private double score;
    }
}
