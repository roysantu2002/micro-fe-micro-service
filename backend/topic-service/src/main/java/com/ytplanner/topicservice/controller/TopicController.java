package com.ytplanner.topicservice.controller;

import com.ytplanner.topicservice.dto.TopicRequest;
import com.ytplanner.topicservice.dto.TopicResponse;
import com.ytplanner.topicservice.model.TopicContent;
import com.ytplanner.topicservice.service.TopicService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/topics")
@RequiredArgsConstructor
public class TopicController {

    private final TopicService topicService;

    @GetMapping
    public ResponseEntity<List<TopicResponse>> getAllTopics() {
        return ResponseEntity.ok(topicService.getAllTopics());
    }

    @GetMapping("/{id}")
    public ResponseEntity<TopicResponse> getTopicById(@PathVariable UUID id) {
        return ResponseEntity.ok(topicService.getTopicById(id));
    }

    @PostMapping
    public ResponseEntity<TopicResponse> createTopic(@RequestBody TopicRequest request) {
        TopicResponse created = topicService.createTopic(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TopicResponse> updateTopic(@PathVariable UUID id, @RequestBody TopicRequest request) {
        return ResponseEntity.ok(topicService.updateTopic(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTopic(@PathVariable UUID id) {
        topicService.deleteTopic(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/generate")
    public ResponseEntity<TopicResponse> generateContent(@PathVariable UUID id) {
        return ResponseEntity.ok(topicService.generateContent(id));
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<TopicContent> getContent(@PathVariable UUID id) {
        return ResponseEntity.ok(topicService.getContentByTopicId(id));
    }
}
