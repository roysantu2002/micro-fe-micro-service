package com.ytplanner.topicservice.kafka;

import com.ytplanner.topicservice.model.Topic;
import com.ytplanner.topicservice.model.TopicContent;
import com.ytplanner.topicservice.repository.TopicContentRepository;
import com.ytplanner.topicservice.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class ContentKafkaConsumer {

    private final TopicContentRepository topicContentRepository;
    private final TopicRepository topicRepository;

    @KafkaListener(topics = "content-generated", groupId = "topic-service")
    public void consumeContentGenerated(ContentGeneratedEvent event) {
        log.info("Received content-generated event for topicId: {}", event.getTopicId());

        try {
            UUID topicId = UUID.fromString(event.getTopicId());

            // Save the generated content
            TopicContent content = TopicContent.builder()
                    .topicId(topicId)
                    .hook(event.getHook())
                    .scriptOutline(event.getScriptOutline())
                    .keyPoints(event.getKeyPoints())
                    .callToAction(event.getCallToAction())
                    .generatedAt(LocalDateTime.now())
                    .build();

            topicContentRepository.save(content);
            log.info("Saved generated content for topicId: {}", topicId);

            // Update topic status to 'completed'
            Optional<Topic> topicOpt = topicRepository.findById(topicId);
            if (topicOpt.isPresent()) {
                Topic topic = topicOpt.get();
                topic.setStatus("completed");
                topicRepository.save(topic);
                log.info("Updated topic status to 'completed' for topicId: {}", topicId);
            } else {
                log.warn("Topic not found for topicId: {}", topicId);
            }
        } catch (Exception e) {
            log.error("Error processing content-generated event for topicId: {}", event.getTopicId(), e);
        }
    }
}
