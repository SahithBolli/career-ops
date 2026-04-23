package io.careerops.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sponsor_companies", indexes = {
    @Index(name = "idx_sponsor_name", columnList = "companyName"),
    @Index(name = "idx_sponsor_state", columnList = "state")
})
@Data
@NoArgsConstructor
public class SponsorCompany {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String companyName;

    private String state;

    private Integer fiscalYear;

    private Integer totalApprovals;

    private Integer initialApprovals;

    private Integer continuingApprovals;

    @Enumerated(EnumType.STRING)
    private SponsorTier tier;

    public enum SponsorTier {
        HIGH,
        MEDIUM,
        LOW
    }
}
