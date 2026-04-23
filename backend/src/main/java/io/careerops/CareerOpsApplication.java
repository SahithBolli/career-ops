package io.careerops;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CareerOpsApplication {
    public static void main(String[] args) {
        SpringApplication.run(CareerOpsApplication.class, args);
    }
}
