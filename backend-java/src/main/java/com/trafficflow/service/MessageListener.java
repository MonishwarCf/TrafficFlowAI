package com.trafficflow.service;

import com.trafficflow.config.RabbitMQConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class MessageListener {

    private static final Logger logger = LoggerFactory.getLogger(MessageListener.class);
    private final SimpMessagingTemplate messagingTemplate;

    @Autowired
    public MessageListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @RabbitListener(queues = RabbitMQConfig.QUEUE_NAME)
    public void receiveMessage(String message) {
        try {
            logger.info("Received Message from RabbitMQ: {}", message);
            messagingTemplate.convertAndSend("/topic/traffic", message);
        } catch (Exception e) {
            logger.error("Error processing message: {}", message, e);
        }
    }
}
