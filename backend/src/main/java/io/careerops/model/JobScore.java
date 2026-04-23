package io.careerops.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "job_scores")
@Data
@NoArgsConstructor
public class JobScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String jobUrl;

    private String company;

    private String role;

    private Double globalScore;

    private Double cvMatchScore;

    private Double compScore;

    private Double culturalScore;

    private Double visaScore;

    private String levelClassification;

    private Boolean levelExcluded;

    private Boolean sponsorshipKnown;

    private Boolean sponsorsH1b;

    @ElementCollection
    @CollectionTable(name = "job_red_flags", joinColumns = @JoinColumn(name = "job_score_id"))
    @Column(name = "flag")
    private List<String> redFlags;

    @ElementCollection
    @CollectionTable(name = "job_keywords", joinColumns = @JoinColumn(name = "job_score_id"))
    @Column(name = "keyword")
    private List<String> extractedKeywords;

    private String recommendation;

    private LocalDateTime scoredAt;

    @PrePersist
    void onCreate() {
        scoredAt = LocalDateTime.now();
    }
}
