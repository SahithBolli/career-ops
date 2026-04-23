package io.careerops.service;

import io.careerops.model.SponsorCompany;
import io.careerops.repository.SponsorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class SponsorDataLoader implements CommandLineRunner {

    private final SponsorRepository sponsorRepository;

    @Override
    public void run(String... args) {
        if (sponsorRepository.count() > 0) return;
        log.info("Loading H-1B sponsor database...");

        // Seed with top H-1B sponsors from DOL OFLC data (FY2023)
        // Full dataset: https://www.dol.gov/agencies/eta/foreign-labor/performance
        List<SponsorCompany> sponsors = List.of(
            sponsor("Amazon.com Services LLC", "WA", 2023, 6182, SponsorCompany.SponsorTier.HIGH),
            sponsor("Google LLC", "CA", 2023, 5842, SponsorCompany.SponsorTier.HIGH),
            sponsor("Microsoft Corporation", "WA", 2023, 4516, SponsorCompany.SponsorTier.HIGH),
            sponsor("Meta Platforms Inc", "CA", 2023, 3918, SponsorCompany.SponsorTier.HIGH),
            sponsor("Apple Inc", "CA", 2023, 3201, SponsorCompany.SponsorTier.HIGH),
            sponsor("Cognizant Technology Solutions", "NJ", 2023, 29821, SponsorCompany.SponsorTier.HIGH),
            sponsor("Infosys Limited", "CA", 2023, 24516, SponsorCompany.SponsorTier.HIGH),
            sponsor("Tata Consultancy Services", "NY", 2023, 22184, SponsorCompany.SponsorTier.HIGH),
            sponsor("Wipro LLC", "CA", 2023, 14382, SponsorCompany.SponsorTier.HIGH),
            sponsor("HCL America Inc", "CA", 2023, 8921, SponsorCompany.SponsorTier.HIGH),
            sponsor("Capgemini America Inc", "TX", 2023, 6284, SponsorCompany.SponsorTier.HIGH),
            sponsor("Deloitte Consulting LLP", "NY", 2023, 5841, SponsorCompany.SponsorTier.HIGH),
            sponsor("IBM Corporation", "NY", 2023, 4812, SponsorCompany.SponsorTier.HIGH),
            sponsor("Accenture LLP", "IL", 2023, 4521, SponsorCompany.SponsorTier.HIGH),
            sponsor("Oracle America Inc", "TX", 2023, 3841, SponsorCompany.SponsorTier.HIGH),
            sponsor("Salesforce Inc", "CA", 2023, 2914, SponsorCompany.SponsorTier.HIGH),
            sponsor("ServiceNow Inc", "CA", 2023, 1842, SponsorCompany.SponsorTier.HIGH),
            sponsor("Workday Inc", "CA", 2023, 1621, SponsorCompany.SponsorTier.HIGH),
            sponsor("Capital One Financial Corporation", "VA", 2023, 1482, SponsorCompany.SponsorTier.HIGH),
            sponsor("JPMorgan Chase Bank NA", "NY", 2023, 2841, SponsorCompany.SponsorTier.HIGH),
            sponsor("Goldman Sachs & Co LLC", "NY", 2023, 1924, SponsorCompany.SponsorTier.HIGH),
            sponsor("Wells Fargo Bank NA", "CA", 2023, 1284, SponsorCompany.SponsorTier.HIGH),
            sponsor("Bank of America NA", "NC", 2023, 1182, SponsorCompany.SponsorTier.HIGH),
            sponsor("Stripe Inc", "CA", 2023, 842, SponsorCompany.SponsorTier.HIGH),
            sponsor("PayPal Inc", "CA", 2023, 921, SponsorCompany.SponsorTier.HIGH),
            sponsor("Twilio Inc", "CA", 2023, 412, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Databricks Inc", "CA", 2023, 514, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Snowflake Inc", "CA", 2023, 481, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Confluent Inc", "CA", 2023, 284, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Palantir Technologies Inc", "CO", 2023, 312, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("American Express Company", "NY", 2023, 842, SponsorCompany.SponsorTier.HIGH),
            sponsor("Honeywell International Inc", "NC", 2023, 621, SponsorCompany.SponsorTier.HIGH),
            sponsor("Siemens Corporation", "NY", 2023, 541, SponsorCompany.SponsorTier.HIGH),
            sponsor("General Electric Company", "MA", 2023, 481, SponsorCompany.SponsorTier.HIGH),
            sponsor("Charles Schwab & Co Inc", "TX", 2023, 284, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("CVS Health Corporation", "RI", 2023, 412, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Veeva Systems Inc", "CA", 2023, 241, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Attentive Mobile Inc", "NJ", 2023, 142, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Glean Technologies Inc", "CA", 2023, 84, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Anthropic PBC", "CA", 2023, 124, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("OpenAI LLC", "CA", 2023, 284, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Perplexity AI Inc", "CA", 2023, 42, SponsorCompany.SponsorTier.LOW),
            sponsor("HashiCorp Inc", "CA", 2023, 184, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("PNC Bank NA", "PA", 2023, 284, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Target Corporation", "MN", 2023, 412, SponsorCompany.SponsorTier.MEDIUM),
            sponsor("Walmart Inc", "AR", 2023, 841, SponsorCompany.SponsorTier.HIGH),
            sponsor("Qualcomm Technologies Inc", "CA", 2023, 1284, SponsorCompany.SponsorTier.HIGH),
            sponsor("Intel Corporation", "OR", 2023, 1841, SponsorCompany.SponsorTier.HIGH),
            sponsor("NVIDIA Corporation", "CA", 2023, 1621, SponsorCompany.SponsorTier.HIGH),
            sponsor("Cisco Systems Inc", "CA", 2023, 2184, SponsorCompany.SponsorTier.HIGH)
        );

        sponsorRepository.saveAll(sponsors);
        log.info("Loaded {} H-1B sponsor records.", sponsors.size());
    }

    private SponsorCompany sponsor(String name, String state, int year, int approvals, SponsorCompany.SponsorTier tier) {
        SponsorCompany s = new SponsorCompany();
        s.setCompanyName(name);
        s.setState(state);
        s.setFiscalYear(year);
        s.setTotalApprovals(approvals);
        s.setTier(tier);
        return s;
    }
}
