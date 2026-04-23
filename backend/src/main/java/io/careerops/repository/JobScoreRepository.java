package io.careerops.repository;

import io.careerops.model.JobScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface JobScoreRepository extends JpaRepository<JobScore, Long> {

    Optional<JobScore> findByJobUrl(String jobUrl);

    List<JobScore> findByGlobalScoreGreaterThanEqualOrderByGlobalScoreDesc(Double minScore);

    List<JobScore> findByLevelExcludedFalseAndGlobalScoreGreaterThanEqualOrderByGlobalScoreDesc(Double minScore);

    @Query("SELECT j FROM JobScore j WHERE j.sponsorsH1b = true AND j.levelExcluded = false ORDER BY j.globalScore DESC")
    List<JobScore> findSponsoredHighScoreJobs();

    @Query("SELECT j FROM JobScore j WHERE j.levelExcluded = true")
    List<JobScore> findExcludedByLevel();
}
