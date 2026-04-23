package io.careerops;

import io.careerops.service.JobLevelClassifier;
import io.careerops.service.SponsorCheckService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CareerOpsApplicationTests {

    @Autowired
    private JobLevelClassifier levelClassifier;

    @Autowired
    private SponsorCheckService sponsorCheckService;

    @Test
    void contextLoads() {}

    @Test
    void seniorRoleIsAllowed() {
        assertThat(levelClassifier.isAllowed("Senior Java Software Engineer")).isTrue();
        assertThat(levelClassifier.getLevelLabel("Senior Java Software Engineer")).isEqualTo("SENIOR");
    }

    @Test
    void leadRoleIsExcluded() {
        assertThat(levelClassifier.isAllowed("Tech Lead")).isFalse();
        assertThat(levelClassifier.isAllowed("Engineering Manager")).isFalse();
        assertThat(levelClassifier.isAllowed("Director of Engineering")).isFalse();
        assertThat(levelClassifier.isAllowed("VP Engineering")).isFalse();
    }

    @Test
    void entryAndMidAreAllowed() {
        assertThat(levelClassifier.isAllowed("Junior Software Engineer")).isTrue();
        assertThat(levelClassifier.isAllowed("Software Engineer")).isTrue();
    }

    @Test
    void knownSponsorReturnsTrue() {
        assertThat(sponsorCheckService.check("Amazon").isKnownSponsor()).isTrue();
        assertThat(sponsorCheckService.check("Google LLC").isKnownSponsor()).isTrue();
        assertThat(sponsorCheckService.check("PayPal Inc").isKnownSponsor()).isTrue();
    }

    @Test
    void jdNoSponsorshipDetected() {
        assertThat(sponsorCheckService.jdMentionsNoSponsorship(
            "Must be authorized to work without sponsorship. US citizens only."
        )).isTrue();
    }

    @Test
    void jdExplicitSponsorDetected() {
        assertThat(sponsorCheckService.jdExplicitlySponsor(
            "We will sponsor H-1B visas for qualified candidates."
        )).isTrue();
    }
}
