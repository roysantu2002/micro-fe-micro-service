package com.ytplanner.topicservice.kafka;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContentGeneratedEvent {

    private String topicId;
    private String hook;
    private String scriptOutline;
    private String keyPoints;
    private String callToAction;
}
