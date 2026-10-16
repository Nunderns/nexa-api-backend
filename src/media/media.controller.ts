import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MEDIA_RATE_LIMIT } from '../common/config/rate-limit.config';
import { mediaUploadOptions } from './media-storage.config';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: MEDIA_RATE_LIMIT })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload media' })
  @ApiResponse({
    status: 201,
    description: 'Media uploaded successfully',
    type: MediaResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Can only upload to own posts/comments',
  })
  @ApiResponse({ status: 429, description: 'Too many uploads' })
  async upload(
    @Body() uploadMediaDto: UploadMediaDto,
    @CurrentUser('id') userId: number,
  ): Promise<MediaResponseDto> {
    return this.mediaService.upload(uploadMediaDto, userId);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: MEDIA_RATE_LIMIT })
  @UseInterceptors(FileInterceptor('file', mediaUploadOptions))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload an image or video file to an own post' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'postId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        postId: { type: 'integer', example: 1 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: MediaResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing or unsupported file' })
  @ApiResponse({ status: 403, description: 'Can only upload to own posts' })
  @ApiResponse({ status: 413, description: 'File is too large' })
  @ApiResponse({ status: 429, description: 'Too many uploads' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    // Read raw so a bad value is rejected by the service, which also removes
    // the file multer has already written.
    @Body('postId') postId: string | undefined,
    @CurrentUser('id') userId: number,
    @Req() req: Request,
  ): Promise<MediaResponseDto> {
    const baseUrl =
      process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`;

    return this.mediaService.uploadFile(file, postId, userId, baseUrl);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media by ID' })
  @ApiResponse({
    status: 200,
    description: 'Media retrieved successfully',
    type: MediaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async findOne(@Param('id') id: string): Promise<MediaResponseDto> {
    return this.mediaService.findOne(+id);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get media by post' })
  @ApiResponse({ status: 200, description: 'Media retrieved successfully' })
  async findByPost(@Param('postId') postId: string) {
    return this.mediaService.findByPost(+postId);
  }

  @Get('comment/:commentId')
  @ApiOperation({ summary: 'Get media by comment' })
  @ApiResponse({ status: 200, description: 'Media retrieved successfully' })
  async findByComment(@Param('commentId') commentId: string) {
    return this.mediaService.findByComment(+commentId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get media by user' })
  @ApiResponse({ status: 200, description: 'Media retrieved successfully' })
  async findByUser(@Param('userId') userId: string) {
    return this.mediaService.findByUser(+userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete media' })
  @ApiResponse({ status: 204, description: 'Media deleted successfully' })
  @ApiResponse({ status: 403, description: 'Can only delete own media' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.mediaService.remove(+id, userId);
  }
}
