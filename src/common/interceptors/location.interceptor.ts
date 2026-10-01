import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';

import type { Response } from 'express';

const LOCATION_OF = 'location:of';

type LocationOf = (body: never) => string;

/** Sets `Location` on a create response, so controllers never touch `@Res()`. */
@Injectable()
export class LocationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const locationOf = this.reflector.get<LocationOf | undefined>(
      LOCATION_OF,
      context.getHandler(),
    );
    return next.handle().pipe(
      tap((body) => {
        if (locationOf) {
          context
            .switchToHttp()
            .getResponse<Response>()
            .setHeader('Location', locationOf(body as never));
        }
      }),
    );
  }
}

/** `@CreatedLocation((dto: ThingDto) => ...)`: the URL of the created resource, from the response body. */
export const CreatedLocation = (locationOf: LocationOf): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(LOCATION_OF, locationOf), UseInterceptors(LocationInterceptor));
