package io.careerops.repository;

import io.careerops.model.SponsorCompany;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SponsorRepository extends JpaRepository<SponsorCompany, Long> {

    @Query("SELECT s FROM SponsorCompany s WHERE LOWER(s.companyName) = LOWER(:name)")
    Optional<SponsorCompany> findByNameExact(String name);

    @Query("SELECT s FROM SponsorCompany s WHERE LOWER(s.companyName) LIKE LOWER(CONCAT('%', :keyword, '%')) ORDER BY s.totalApprovals DESC")
    List<SponsorCompany> searchByName(String keyword);

    @Query("SELECT s FROM SponsorCompany s WHERE s.state = :state ORDER BY s.totalApprovals DESC")
    List<SponsorCompany> findByState(String state);

    @Query("SELECT s FROM SponsorCompany s WHERE s.tier = 'HIGH' ORDER BY s.totalApprovals DESC")
    List<SponsorCompany> findTopSponsors();
}
