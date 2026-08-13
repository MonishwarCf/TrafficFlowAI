package com.trafficflow.service;

import com.trafficflow.config.RabbitMQConfig;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

@Controller
public class TopologyController {

    private final RabbitTemplate rabbitTemplate;

    @Autowired
    public TopologyController(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    @MessageMapping("/topology")
    public void receiveTopologyUpdate(String message) {
        System.out.println("Received topology update from WebSocket: " + message);
        rabbitTemplate.convertAndSend(RabbitMQConfig.EXCHANGE_NAME, "topology.update", message);
    }
}
