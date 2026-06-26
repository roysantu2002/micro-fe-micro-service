package com.ytplanner.topicservice.repository;

import com.ytplanner.topicservice.model.TopicContent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TopicContentRepository extends JpaRepository<TopicContent, UUID> {

    Optional<TopicContent> findByTopicId(UUID topicId);
}
