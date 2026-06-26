package com.ytplanner.topicservice.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "topic_content")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopicContent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @Column(name = "topic_id", nullable = false)
    private UUID topicId;

    @Column(name = "hook", columnDefinition = "TEXT")
    private String hook;

    @Column(name = "script_outline", columnDefinition = "TEXT")
    private String scriptOutline;

    @Column(name = "key_points", columnDefinition = "TEXT")
    private String keyPoints;

    @Column(name = "call_to_action", columnDefinition = "TEXT")
    private String callToAction;

    @Column(name = "generated_at")
    private LocalDateTime generatedAt;
}
