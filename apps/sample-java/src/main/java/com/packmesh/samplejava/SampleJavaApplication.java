package com.packmesh.samplejava;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SampleJavaApplication {
    /**
     * Starts the Spring Boot application and boots the embedded web server.
     *
     * @param args runtime arguments passed from the command line.
     */
    public static void main(String[] args) {
        SpringApplication.run(SampleJavaApplication.class, args);
    }
}
