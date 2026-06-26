package com.ytplanner.topicservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopicResponse {

    private UUID id;
    private String title;
    private String description;
    private String[] tags;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
