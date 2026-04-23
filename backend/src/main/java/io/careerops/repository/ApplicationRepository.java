package io.careerops.repository;

import io.careerops.model.Application;
import io.careerops.model.ApplicationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long> {

    List<Application> findByStatusOrderByAppliedDateDesc(ApplicationStatus status);

    List<Application> findByCompanyIgnoreCaseAndRoleIgnoreCase(String company, String role);

    List<Application> findByDeadlineDateBeforeAndStatusIn(LocalDate date, List<ApplicationStatus> statuses);

    @Query("SELECT a FROM Application a WHERE a.deadlineDate BETWEEN :today AND :cutoff AND a.status IN ('EVALUATED')")
    List<Application> findUpcomingDeadlines(LocalDate today, LocalDate cutoff);

    @Query("SELECT a.status, COUNT(a) FROM Application a GROUP BY a.status")
    List<Object[]> countByStatus();

    @Query("SELECT AVG(a.score) FROM Application a WHERE a.score IS NOT NULL")
    Optional<Double> findAverageScore();

    @Query("SELECT a FROM Application a WHERE a.sponsorshipConfirmed = true ORDER BY a.score DESC")
    List<Application> findSponsoredApplications();

    boolean existsByCompanyIgnoreCaseAndRoleIgnoreCase(String company, String role);
}
