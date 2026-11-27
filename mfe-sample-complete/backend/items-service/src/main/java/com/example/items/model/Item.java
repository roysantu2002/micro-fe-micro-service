package com.example.items.model;

import java.time.LocalDateTime;

public record Item(
    Long id,
    String name,
    String createdBy,
    LocalDateTime createdAt
) {}
