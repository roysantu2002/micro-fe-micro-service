package com.ytplanner.topicservice.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class TopicKafkaProducer {

    private static final String TOPIC_CREATED = "topic-created";

    private final KafkaTemplate<String, TopicCreatedEvent> kafkaTemplate;

    public void sendTopicCreatedEvent(TopicCreatedEvent event) {
        log.info("Publishing topic-created event for topicId: {}", event.getTopicId());
        kafkaTemplate.send(TOPIC_CREATED, event.getTopicId(), event);
        log.info("Successfully published topic-created event for topicId: {}", event.getTopicId());
    }
}
