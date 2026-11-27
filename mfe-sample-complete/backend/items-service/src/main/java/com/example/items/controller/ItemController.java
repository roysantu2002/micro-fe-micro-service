package com.example.items.controller;

import com.example.items.model.Item;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api/items")
public class ItemController {

    private static final Logger log = LoggerFactory.getLogger(ItemController.class);

    private final List<Item> store = new ArrayList<>();
    private final AtomicLong counter = new AtomicLong(1);

    private void logToken(HttpServletRequest req, Jwt jwt) {
        String authHeader = req.getHeader("Authorization");
        log.info("=== [BACKEND] Incoming request: {} {} ===", req.getMethod(), req.getRequestURI());
        log.info("[BACKEND] Raw Authorization header: {}", authHeader);
        if (jwt != null) {
            log.info("[BACKEND] JWT decoded — subject: {}", jwt.getSubject());
            log.info("[BACKEND] JWT decoded — preferred_username: {}", jwt.getClaimAsString("preferred_username"));
            log.info("[BACKEND] JWT decoded — name: {}", jwt.getClaimAsString("name"));
            log.info("[BACKEND] JWT decoded — issuer: {}", jwt.getIssuer());
            log.info("[BACKEND] JWT decoded — expires: {}", jwt.getExpiresAt());
            log.info("[BACKEND] JWT decoded — all claims: {}", jwt.getClaims());
        } else {
            log.info("[BACKEND] No JWT principal (mock.auth=true or unauthenticated)");
        }
    }

    @GetMapping
    public List<Item> list(HttpServletRequest req,
                           @AuthenticationPrincipal Jwt jwt) {
        logToken(req, jwt);
        return store;
    }

    @PostMapping
    public Item create(@RequestBody CreateItemRequest body,
                       HttpServletRequest req,
                       @AuthenticationPrincipal Jwt jwt) {
        logToken(req, jwt);

        String createdBy = "mock-user";
        if (jwt != null) {
            createdBy = jwt.getClaimAsString("preferred_username");
            if (createdBy == null) createdBy = jwt.getClaimAsString("name");
            if (createdBy == null) createdBy = jwt.getSubject();
        }

        Item item = new Item(counter.getAndIncrement(), body.name(), createdBy, LocalDateTime.now());
        store.add(0, item);
        log.info("[BACKEND] Created item: {} by {}", item.name(), item.createdBy());
        return item;
    }

    public record CreateItemRequest(String name) {}
}
