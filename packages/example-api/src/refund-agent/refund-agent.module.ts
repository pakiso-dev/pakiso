import { Module } from '@nestjs/common';
import { RefundAgentController } from './refund-agent.controller.js';
import { RefundAgentService } from './refund-agent.service.js';

@Module({
  controllers: [RefundAgentController],
  providers: [RefundAgentService],
})
export class RefundAgentModule {}
