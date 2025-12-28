# AutoLearnPro LMS - System Architecture Documentation

## Table of Contents
- [Overview](#overview)
- [High-Level Architecture](#high-level-architecture)
- [Infrastructure Diagram](#infrastructure-diagram)
- [Data Flow Diagram](#data-flow-diagram)
- [Authentication Flow](#authentication-flow)
- [Deployment Pipeline](#deployment-pipeline)
- [Component Architecture](#component-architecture)
- [Database Schema](#database-schema)

---

## Overview

AutoLearnPro is a cloud-native Learning Management System built with:
- **Backend**: Elixir/Phoenix (REST API)
- **Frontend**: Next.js 14 (React, TypeScript)
- **Database**: PostgreSQL
- **Cache**: Redis
- **Infrastructure**: Kubernetes (multi-cloud ready)
- **Observability**: Prometheus + Grafana

**Deployment Model**: Containerized microservices on Kubernetes with horizontal auto-scaling

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        Mobile[Mobile App - Future]
    end

    subgraph "CDN & Edge"
        CF[Cloudflare CDN]
    end

    subgraph "Kubernetes Cluster"
        subgraph "Ingress Layer"
            Ingress[nginx-ingress<br/>TLS Termination<br/>Rate Limiting]
        end

        subgraph "Application Layer"
            Frontend[Next.js Frontend<br/>React + TypeScript]
            API[Phoenix API<br/>Elixir Backend]
            HPA[Horizontal Pod<br/>Autoscaler]
        end

        subgraph "Data Layer"
            PostgreSQL[(PostgreSQL<br/>Primary Database)]
            Redis[(Redis<br/>Cache & Sessions)]
            PVC[Persistent Volume<br/>File Uploads]
        end

        subgraph "Observability"
            Prometheus[Prometheus<br/>Metrics Collection]
            Grafana[Grafana<br/>Dashboards]
        end
    end

    subgraph "External Services"
        SMTP[Email Service]
        Storage[Cloud Storage - Future]
        AI[AI Services - Future]
    end

    Browser --> CF
    Mobile -.-> CF
    CF --> Ingress
    Ingress --> Frontend
    Ingress --> API
    
    Frontend --> API
    API --> PostgreSQL
    API --> Redis
    API --> PVC
    API -.-> SMTP
    API -.-> Storage
    API -.-> AI
    
    API --> Prometheus
    Prometheus --> Grafana
    
    HPA -.->|scales| API
    HPA -.->|scales| Frontend
```

---

## Infrastructure Diagram

```mermaid
graph TB
    subgraph "DNS & CDN"
        DNS[Cloudflare DNS]
        CDN[Cloudflare CDN<br/>WAF + DDoS Protection]
    end

    subgraph "Kubernetes Cluster - GKE/EKS/AKS"
        subgraph "ingress-nginx namespace"
            LB[Load Balancer<br/>External IP]
            NginxController[Nginx Ingress Controller<br/>Metrics on :10254]
            NginxCM[ConfigMap<br/>Cloudflare IPs<br/>real-ip-header]
        end

        subgraph "autolearnpro namespace"
            LMSDeployment[lms-api Deployment<br/>2-6 replicas<br/>HPA enabled]
            LMSService[lms-api Service<br/>ClusterIP :4000]
            LMSIngress[Ingress<br/>autolearnpro.com<br/>TLS: letsencrypt-prod]
            LMSPVC[PVC: uploads<br/>50Gi]
            NetworkPolicy[NetworkPolicy<br/>Pod-level security]
        end

        subgraph "monitoring namespace"
            PromDeployment[Prometheus<br/>Metrics storage: 50Gi]
            GrafanaDeployment[Grafana<br/>storage: 10Gi]
            GrafanaIngress[Ingress<br/>grafana.autolearnpro.com]
        end

        subgraph "cert-manager namespace"
            CertManager[cert-manager<br/>TLS automation]
            ClusterIssuer[ClusterIssuer<br/>letsencrypt-prod]
        end

        subgraph "External Data"
            CloudSQL[(Cloud SQL<br/>PostgreSQL)]
            MemoryStore[(Memorystore/ElastiCache<br/>Redis)]
        end
    end

    subgraph "CI/CD"
        GitHub[GitHub Actions<br/>OIDC Auth]
        GHCR[GitHub Container Registry<br/>Docker Images]
    end

    DNS --> CDN
    CDN --> LB
    LB --> NginxController
    NginxController --> LMSService
    NginxController --> GrafanaDeployment
    
    LMSService --> LMSDeployment
    LMSDeployment --> CloudSQL
    LMSDeployment --> MemoryStore
    LMSDeployment --> LMSPVC
    
    LMSIngress -.->|routes| NginxController
    GrafanaIngress -.->|routes| NginxController
    
    CertManager -.->|provisions| LMSIngress
    CertManager -.->|provisions| GrafanaIngress
    
    LMSDeployment -->|scrapes| PromDeployment
    NginxController -->|metrics| PromDeployment
    PromDeployment --> GrafanaDeployment
    
    NetworkPolicy -.->|restricts| LMSDeployment
    
    GitHub -->|deploy| LMSDeployment
    GitHub -->|push| GHCR
    GHCR -.->|pull| LMSDeployment
```

---

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Cloudflare
    participant Ingress
    participant Frontend
    participant API
    participant Redis
    participant PostgreSQL
    participant Prometheus

    User->>Browser: Access autolearnpro.com
    Browser->>Cloudflare: HTTPS Request
    Cloudflare->>Ingress: Forward with CF-Connecting-IP
    Ingress->>Frontend: Route to Next.js
    Frontend->>Browser: Render Landing Page
    
    User->>Browser: Login with credentials
    Browser->>Cloudflare: POST /api/login
    Cloudflare->>Ingress: Forward request
    Ingress->>API: Route to Phoenix API
    
    API->>Redis: Check rate limit
    Redis-->>API: Allow
    
    API->>PostgreSQL: Authenticate user
    PostgreSQL-->>API: User record
    
    API->>API: Generate JWT token
    API->>Redis: Store session
    API-->>Browser: Return JWT + user data
    
    Browser->>Browser: Store JWT in localStorage
    Browser->>Cloudflare: GET /api/my-enrollments (with JWT)
    Cloudflare->>Ingress: Forward request
    Ingress->>API: Route with Authorization header
    
    API->>API: Verify JWT
    API->>PostgreSQL: Fetch enrollments
    PostgreSQL-->>API: Enrollment records
    API-->>Browser: Return enrollments
    
    API->>Prometheus: Export metrics
    Note over Prometheus: Request count<br/>Response time<br/>Error rate
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant Client as Web Client
    participant Frontend as Next.js Frontend
    participant AuthContext as AuthContext
    participant API as Phoenix API
    participant Guardian as Guardian (JWT)
    participant Database as PostgreSQL
    participant Redis as Redis Cache

    Client->>Frontend: Enter email & password
    Frontend->>AuthContext: login(email, password)
    AuthContext->>API: POST /api/login
    
    API->>API: RateLimiter plug check
    alt Rate limit exceeded
        API-->>Client: 429 Too Many Requests
    end
    
    API->>API: RedactionPlug sanitize params
    API->>Database: SELECT user WHERE email = ?
    
    alt User not found
        Database-->>API: null
        API-->>Client: 401 Unauthorized
    end
    
    Database-->>API: User record
    API->>API: Verify password with Argon2
    
    alt Invalid password
        API-->>Client: 401 Invalid credentials
    end
    
    API->>Guardian: encode_and_sign(user)
    Guardian-->>API: JWT token
    
    API->>Redis: SETEX session:{user_id} token
    API-->>AuthContext: {token, user}
    
    AuthContext->>AuthContext: localStorage.setItem('token')
    AuthContext->>AuthContext: localStorage.setItem('user')
    AuthContext->>AuthContext: setState({ user })
    
    AuthContext-->>Frontend: Success
    Frontend->>Client: Redirect to /dashboard
    
    Note over Client,Redis: Subsequent Requests
    
    Client->>Frontend: Access protected route
    Frontend->>AuthContext: Check user state
    
    alt User not logged in
        AuthContext-->>Frontend: null
        Frontend->>Client: Redirect to /login
    end
    
    Frontend->>API: GET /api/my-enrollments<br/>Authorization: Bearer {token}
    
    API->>API: Auth.Pipeline verify JWT
    API->>Guardian: decode_and_verify(token)
    
    alt Invalid/Expired token
        Guardian-->>API: {:error, :invalid}
        API-->>Client: 401 Unauthorized
    end
    
    Guardian-->>API: {:ok, claims}
    API->>Redis: GET session:{user_id}
    
    alt Session expired
        Redis-->>API: nil
        API-->>Client: 401 Session expired
    end
    
    Redis-->>API: Session data
    API->>Database: Fetch enrollments
    Database-->>API: Enrollment records
    API-->>Client: 200 OK with data
```

---

## Deployment Pipeline

```mermaid
graph LR
    subgraph "Developer Workflow"
        Dev[Developer]
        Git[Git Commit]
    end

    subgraph "GitHub Actions CI/CD"
        Trigger[Workflow Trigger<br/>push to main]
        
        subgraph "Build Stage"
            Checkout[Checkout Code]
            ElixirTests[Run Elixir Tests<br/>ExUnit + Coverage]
            Security[Security Scans<br/>Trivy + CodeQL]
            Build[Docker Build<br/>Multi-arch amd64/arm64]
        end

        subgraph "Push Stage"
            Tag[Tag Image<br/>SHA + latest]
            Push[Push to GHCR<br/>ghcr.io/73junito/lms-api]
        end

        subgraph "Deploy Stage"
            OIDC[OIDC Authentication<br/>GKE/EKS/AKS]
            UpdateManifest[Update Deployment<br/>Set image tag]
            Apply[kubectl apply]
            RolloutCheck[Verify Rollout Status]
            SmokeTest[Run Smoke Test Job]
        end
    end

    subgraph "Kubernetes Cluster"
        Deployment[lms-api Deployment]
        ReplicaSet[ReplicaSet]
        Pods[Pods 1-6]
        HealthCheck[Liveness/Readiness Probes]
    end

    subgraph "Automation"
        Dependabot[Dependabot<br/>Weekly dependency updates]
        CloudflareSync[Cloudflare IP Sync<br/>Weekly cron job]
    end

    Dev --> Git
    Git --> Trigger
    Trigger --> Checkout
    Checkout --> ElixirTests
    ElixirTests --> Security
    Security --> Build
    Build --> Tag
    Tag --> Push
    
    Push --> OIDC
    OIDC --> UpdateManifest
    UpdateManifest --> Apply
    Apply --> Deployment
    
    Deployment --> ReplicaSet
    ReplicaSet --> Pods
    Pods --> HealthCheck
    
    HealthCheck -->|healthy| RolloutCheck
    RolloutCheck --> SmokeTest
    
    HealthCheck -->|unhealthy| RolloutCheck
    RolloutCheck -.->|rollback| ReplicaSet
    
    Dependabot -.->|creates PR| Git
    CloudflareSync -.->|updates ConfigMap| Deployment
```

---

## Component Architecture

```mermaid
graph TB
    subgraph "Frontend - Next.js"
        Pages[Pages<br/>SSR + Client Routes]
        Components[React Components<br/>Navigation, Forms]
        AuthContext[AuthContext<br/>Global auth state]
        APIClient[API Client<br/>Fetch wrapper]
        Types[TypeScript Types<br/>Shared interfaces]
    end

    subgraph "Backend - Phoenix API"
        Router[Router<br/>Route definitions]
        
        subgraph "Plugs Middleware"
            RateLimiter[RateLimiter<br/>Hammer-based]
            RedactionPlug[RedactionPlug<br/>PII sanitization]
            CloudflareIP[CloudflareRemoteIp<br/>Real IP detection]
            AuthPipeline[Auth.Pipeline<br/>JWT verification]
        end

        subgraph "Controllers"
            AuthController[AuthController<br/>register, login]
            CourseController[CourseController<br/>CRUD operations]
            EnrollmentController[EnrollmentController<br/>enroll, progress]
            AssessmentController[AssessmentController<br/>tests, grading]
        end

        subgraph "Contexts - Business Logic"
            Accounts[Accounts<br/>User management]
            Catalog[Catalog<br/>Courses, modules]
            Enrollments[Enrollments<br/>Student enrollments]
            Assessments[Assessments<br/>Tests, questions]
            Progress[Progress<br/>Learning tracking]
        end

        subgraph "Schemas - Data Models"
            UserSchema[User]
            CourseSchema[Course]
            EnrollmentSchema[Enrollment]
            ModuleSchema[Module]
            LessonSchema[Lesson]
        end
    end

    subgraph "Database"
        PG[(PostgreSQL)]
        RedisDB[(Redis)]
    end

    Pages --> Components
    Pages --> AuthContext
    Components --> APIClient
    APIClient --> Types
    
    APIClient -->|HTTP/JSON| Router
    
    Router --> RateLimiter
    RateLimiter --> RedactionPlug
    RedactionPlug --> CloudflareIP
    CloudflareIP --> AuthPipeline
    
    AuthPipeline --> AuthController
    AuthPipeline --> CourseController
    AuthPipeline --> EnrollmentController
    AuthPipeline --> AssessmentController
    
    AuthController --> Accounts
    CourseController --> Catalog
    EnrollmentController --> Enrollments
    AssessmentController --> Assessments
    
    Accounts --> UserSchema
    Catalog --> CourseSchema
    Catalog --> ModuleSchema
    Catalog --> LessonSchema
    Enrollments --> EnrollmentSchema
    Enrollments --> Progress
    
    UserSchema --> PG
    CourseSchema --> PG
    EnrollmentSchema --> PG
    ModuleSchema --> PG
    LessonSchema --> PG
    
    Accounts --> RedisDB
    Enrollments --> RedisDB
```

---

## Database Schema

```mermaid
erDiagram
    USERS ||--o{ ENROLLMENTS : has
    USERS ||--o{ COURSES : instructs
    USERS ||--o{ AUDIT_LOGS : generates
    
    COURSES ||--o{ ENROLLMENTS : contains
    COURSES ||--o{ COURSE_MODULES : has
    COURSES ||--o{ ASSESSMENTS : has
    
    COURSE_MODULES ||--o{ MODULE_LESSONS : contains
    
    MODULE_LESSONS ||--o{ PROGRESS : tracks
    
    ASSESSMENTS ||--o{ ASSESSMENT_QUESTIONS : contains
    ASSESSMENTS ||--o{ ASSESSMENT_ATTEMPTS : has
    
    ASSESSMENT_ATTEMPTS ||--o{ ASSESSMENT_ANSWERS : has
    
    USERS {
        uuid id PK
        string email UK
        string password_hash
        string full_name
        string role
        timestamp inserted_at
        timestamp updated_at
    }
    
    COURSES {
        uuid id PK
        string title
        string code UK
        text description
        integer duration_hours
        string difficulty_level
        uuid instructor_id FK
        string status
    }
    
    ENROLLMENTS {
        uuid id PK
        uuid user_id FK
        uuid course_id FK
        string status
        integer progress_percentage
        timestamp enrolled_at
        timestamp completed_at
    }
    
    COURSE_MODULES {
        uuid id PK
        uuid course_id FK
        string title
        integer order_index
        integer duration_minutes
    }
    
    MODULE_LESSONS {
        uuid id PK
        uuid module_id FK
        string title
        text content
        string lesson_type
        integer order_index
    }
    
    PROGRESS {
        uuid id PK
        uuid user_id FK
        uuid lesson_id FK
        string status
        integer completion_percentage
        timestamp last_accessed_at
    }
    
    ASSESSMENTS {
        uuid id PK
        uuid course_id FK
        string title
        string assessment_type
        integer passing_score
        integer max_attempts
    }
    
    ASSESSMENT_ATTEMPTS {
        uuid id PK
        uuid user_id FK
        uuid assessment_id FK
        integer attempt_number
        integer score
        string status
        timestamp submitted_at
    }
    
    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        text description
        jsonb metadata
        timestamp inserted_at
    }
```

---

## Security Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        subgraph "Layer 1: Edge Security"
            WAF[Cloudflare WAF<br/>DDoS Protection]
            CDN[CDN Caching<br/>Bot Detection]
        end

        subgraph "Layer 2: Network Security"
            NetworkPolicy[NetworkPolicy<br/>Pod isolation]
            Ingress[Nginx Ingress<br/>TLS 1.3 only<br/>Rate limiting]
        end

        subgraph "Layer 3: Application Security"
            JWT[JWT Authentication<br/>Guardian library]
            RateLimit[Rate Limiting<br/>Hammer plugin]
            Redaction[PII Redaction<br/>Log sanitization]
            RBAC[Role-Based Access<br/>student/instructor/admin]
        end

        subgraph "Layer 4: Data Security"
            Encryption[Data Encryption<br/>At rest & in transit]
            Secrets[K8s Secrets<br/>Environment variables]
            Passwords[Argon2 Password Hashing]
        end

        subgraph "Layer 5: Audit & Monitoring"
            AuditLog[Audit Logging<br/>All sensitive actions]
            Prometheus[Security Metrics<br/>Failed auth attempts]
            Alerts[Alerting<br/>Anomaly detection]
        end
    end

    Request[User Request] --> WAF
    WAF --> CDN
    CDN --> NetworkPolicy
    NetworkPolicy --> Ingress
    Ingress --> RateLimit
    RateLimit --> JWT
    JWT --> RBAC
    RBAC --> Redaction
    Redaction --> Encryption
    Encryption --> Secrets
    Secrets --> Passwords
    
    JWT --> AuditLog
    RBAC --> AuditLog
    RateLimit --> Prometheus
    AuditLog --> Prometheus
    Prometheus --> Alerts
```

---

## Scaling Strategy

```mermaid
graph LR
    subgraph "Horizontal Scaling"
        HPA[Horizontal Pod Autoscaler]
        Target[Target: 60% CPU]
        Min[Min Replicas: 2]
        Max[Max Replicas: 6]
    end

    subgraph "Application Layer"
        Pod1[Pod 1]
        Pod2[Pod 2]
        Pod3[Pod 3]
        PodN[Pod 4-6]
    end

    subgraph "Data Layer"
        PGPrimary[(PostgreSQL Primary)]
        PGReplica[(Read Replicas)]
        RedisCluster[(Redis Cluster)]
    end

    subgraph "Load Distribution"
        Service[K8s Service<br/>Round-robin]
    end

    HPA -->|monitors| Pod1
    HPA -->|monitors| Pod2
    HPA -->|scales| Pod3
    HPA -.->|creates| PodN
    
    Service --> Pod1
    Service --> Pod2
    Service --> Pod3
    Service -.-> PodN
    
    Pod1 --> PGPrimary
    Pod1 --> PGReplica
    Pod2 --> PGPrimary
    Pod2 --> PGReplica
    Pod3 --> PGPrimary
    
    Pod1 --> RedisCluster
    Pod2 --> RedisCluster
    Pod3 --> RedisCluster
```

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14, React, TypeScript, TailwindCSS | UI/UX, SSR, Client routing |
| **Backend** | Elixir 1.16, Phoenix, Ecto | REST API, Business logic |
| **Authentication** | Guardian, JWT, Argon2 | User auth, Token management |
| **Database** | PostgreSQL 15+ | Primary data store |
| **Cache** | Redis 7+ | Sessions, Rate limiting |
| **Container** | Docker, Multi-stage builds | Application packaging |
| **Orchestration** | Kubernetes 1.24+ | Container management |
| **Ingress** | nginx-ingress, cert-manager | Traffic routing, TLS |
| **Monitoring** | Prometheus, Grafana | Metrics, Dashboards |
| **Testing** | ExUnit, Playwright | Unit tests, E2E tests |
| **CI/CD** | GitHub Actions, OIDC | Automated deployment |
| **Security** | Cloudflare, NetworkPolicy, RBAC | Multi-layer security |

---

## Performance Characteristics

### Expected Response Times
- **Static pages**: < 200ms (TTL)
- **API authentication**: < 100ms (with Redis cache)
- **Course listing**: < 300ms (with eager loading)
- **Enrollment operations**: < 500ms (database writes)

### Scalability Targets
- **Concurrent users**: 10,000+
- **Requests/second**: 1,000+
- **Database connections**: 100 (pool size: 10 per pod × 10 pods)
- **Storage**: 1TB+ (uploads PVC scalable)

### High Availability
- **Uptime target**: 99.9% (43.8 min downtime/month)
- **RTO (Recovery Time Objective)**: < 5 minutes
- **RPO (Recovery Point Objective)**: < 1 hour
- **Pod disruption budget**: minAvailable: 1

---

## Future Enhancements

1. **Microservices Split**: Separate content generation service
2. **GraphQL API**: Add GraphQL endpoint alongside REST
3. **WebSocket Support**: Real-time updates for live sessions
4. **Mobile Apps**: Native iOS/Android applications
5. **AI Integration**: Content generation, auto-grading
6. **Video Streaming**: Integrated video player with CDN
7. **Internationalization**: Multi-language support
8. **Analytics Dashboard**: Advanced learning analytics

---

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Phoenix Framework](https://www.phoenixframework.org/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Elixir Getting Started](https://elixir-lang.org/getting-started/introduction.html)

---

*Last Updated: December 16, 2025*  
*Version: 1.0*  
*Maintainer: AutoLearnPro Development Team*
