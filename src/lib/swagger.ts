import swaggerJsdoc from "swagger-jsdoc"

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Particula API",
      version: "0.1.0",
      description: "API de inteligencia competitiva para marcas D2C",
    },
    components: {
      securitySchemes: {
        sessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "authjs.session-token",
        },
      },
    },
  },
  apis: ["./src/app/api/**/route.ts"],
}

export const swaggerSpec = swaggerJsdoc(options)
