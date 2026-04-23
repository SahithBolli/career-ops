package io.careerops.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI careerOpsApi() {
        return new OpenAPI()
            .info(new Info()
                .title("career-ops Java API")
                .description("""
                    Java Spring Boot backend for career-ops — AI-powered job search automation.

                    Key features:
                    - **H-1B Sponsor Intelligence**: Check any company against DOL OFLC database (50+ records)
                    - **Job Level Classifier**: Auto-filters Lead/Manager/Director+ roles (Entry/Mid/Senior only)
                    - **Job Scoring Engine**: Scores JDs against your profile with visa adjustment
                    - **Application Tracker**: Full CRUD with analytics, response rates, deadline alerts
                    - **STEM OPT Dashboard**: Sponsorship stats, pipeline analytics for international candidates
                    """)
                .version("1.0.0")
                .contact(new Contact()
                    .name("Sahith Bolli")
                    .email("sahithbolli980@gmail.com")
                    .url("https://linkedin.com/in/sahith-bolli"))
                .license(new License().name("MIT").url("https://opensource.org/licenses/MIT"))
            );
    }
}
