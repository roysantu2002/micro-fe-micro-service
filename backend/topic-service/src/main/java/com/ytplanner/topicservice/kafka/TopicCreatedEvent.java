package com.ytplanner.topicservice.kafka;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopicCreatedEvent {

    private String topicId;
    private String title;
    private String description;
    private String[] tags;
}
