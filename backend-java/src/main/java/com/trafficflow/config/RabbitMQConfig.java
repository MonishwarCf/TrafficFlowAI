package com.trafficflow.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE_NAME = "traffic_exchange";
    public static final String QUEUE_NAME = "traffic_queue";
    public static final String ROUTING_KEY = "traffic.#";
    
    public static final String TOPOLOGY_QUEUE_NAME = "traffic.topology";
    public static final String TOPOLOGY_ROUTING_KEY = "topology.#";

    @Bean
    Queue queue() {
        return new Queue(QUEUE_NAME, true);
    }
    
    @Bean
    Queue topologyQueue() {
        return new Queue(TOPOLOGY_QUEUE_NAME, true);
    }

    @Bean
    TopicExchange exchange() {
        return new TopicExchange(EXCHANGE_NAME, false, false);
    }

    @Bean
    Binding binding(Queue queue, TopicExchange exchange) {
        return BindingBuilder.bind(queue).to(exchange).with(ROUTING_KEY);
    }
    
    @Bean
    Binding topologyBinding(Queue topologyQueue, TopicExchange exchange) {
        return BindingBuilder.bind(topologyQueue).to(exchange).with(TOPOLOGY_ROUTING_KEY);
    }
}
