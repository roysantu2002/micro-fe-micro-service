package com.ytplanner.topicservice.service;

import com.ytplanner.topicservice.dto.TopicRequest;
import com.ytplanner.topicservice.dto.TopicResponse;
import com.ytplanner.topicservice.kafka.TopicCreatedEvent;
import com.ytplanner.topicservice.kafka.TopicKafkaProducer;
import com.ytplanner.topicservice.model.Topic;
import com.ytplanner.topicservice.model.TopicContent;
import com.ytplanner.topicservice.repository.TopicContentRepository;
import com.ytplanner.topicservice.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TopicService {

    private final TopicRepository topicRepository;
    private final TopicContentRepository topicContentRepository;
    private final TopicKafkaProducer kafkaProducer;

    public List<TopicResponse> getAllTopics() {
        return topicRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public TopicResponse getTopicById(UUID id) {
        Topic topic = topicRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Topic not found with id: " + id));
        return toResponse(topic);
    }

    @Transactional
    public TopicResponse createTopic(TopicRequest request) {
        Topic topic = Topic.builder()
                .title(request.getTitle())
                .description(request.getDescription())
                .tags(request.getTags())
                .status("draft")
                .build();

        Topic saved = topicRepository.save(topic);
        log.info("Created topic with id: {}", saved.getId());
        return toResponse(saved);
    }

    @Transactional
    public TopicResponse updateTopic(UUID id, TopicRequest request) {
        Topic topic = topicRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Topic not found with id: " + id));

        topic.setTitle(request.getTitle());
        topic.setDescription(request.getDescription());
        topic.setTags(request.getTags());

        Topic updated = topicRepository.save(topic);
        log.info("Updated topic with id: {}", updated.getId());
        return toResponse(updated);
    }

    @Transactional
    public void deleteTopic(UUID id) {
        if (!topicRepository.existsById(id)) {
            throw new RuntimeException("Topic not found with id: " + id);
        }
        topicRepository.deleteById(id);
        log.info("Deleted topic with id: {}", id);
    }

    @Transactional
    public TopicResponse generateContent(UUID id) {
        Topic topic = topicRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Topic not found with id: " + id));

        // Update status to 'generating'
        topic.setStatus("generating");
        topicRepository.save(topic);

        // Publish Kafka event
        TopicCreatedEvent event = TopicCreatedEvent.builder()
                .topicId(topic.getId().toString())
                .title(topic.getTitle())
                .description(topic.getDescription())
                .tags(topic.getTags())
                .build();

        kafkaProducer.sendTopicCreatedEvent(event);
        log.info("Triggered content generation for topicId: {}", id);

        return toResponse(topic);
    }

    public TopicContent getContentByTopicId(UUID topicId) {
        // Verify topic exists
        if (!topicRepository.existsById(topicId)) {
            throw new RuntimeException("Topic not found with id: " + topicId);
        }

        return topicContentRepository.findByTopicId(topicId)
                .orElseThrow(() -> new RuntimeException("Content not found for topicId: " + topicId));
    }

    private TopicResponse toResponse(Topic topic) {
        return TopicResponse.builder()
                .id(topic.getId())
                .title(topic.getTitle())
                .description(topic.getDescription())
                .tags(topic.getTags())
                .status(topic.getStatus())
                .createdAt(topic.getCreatedAt())
                .updatedAt(topic.getUpdatedAt())
                .build();
    }
}
