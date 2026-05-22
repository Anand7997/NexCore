# Self-Improvement Roadmap: 6 LPA → 20+ LPA & Microsoft

## Profile Snapshot
- **Current**: 6 LPA | 2 Years Experience
- **Target**: 20+ LPA | Microsoft (Dream)
- **Timeline**: 4-6 Months
- **Key Asset**: NexCore (AI-Autonomous Testing Platform) — Top 1% project for this experience level

---

## Daily Routine (Minimum 3-4 Hours/Day)

| Time Block | Activity | Focus |
|------------|----------|-------|
| 1 Hour | DSA | 2 Problems (1 Medium, 1 Hard) |
| 45 Mins | CS Fundamentals | OS / DBMS / Networks rotation |
| 45 Mins | System Design / Project | LLD patterns or NexCore deep dive |
| 30 Mins | Behavioral / Resume | STAR stories, LinkedIn, applications |

---

## Phase 1: DSA Foundation (Weeks 1-6)

**Goal**: Solve 150+ problems confidently. Microsoft asks Medium-Hard DSA.

### Topics Priority (Microsoft Focus)
1. **Arrays & Strings** (Sliding Window, Two Pointers)
2. **Linked Lists** (Reverse, Merge, Cycle detection)
3. **Trees & BST** (Traversal, LCA, Diameter, Serialization)
4. **Graphs** (BFS, DFS, Topological Sort, Dijkstra, Union-Find)
5. **Dynamic Programming** (Knapsack, LIS, Grid, String DP)
6. **Hash Maps & Sets** (Frequency, Subarrays)
7. **Stacks & Queues** (Monotonic Stack, Sliding Window Max)
8. **Heaps/Priority Queue** (Kth element, Merge intervals)
9. **Binary Search** (On answer, Rotated arrays)
10. **Backtracking** (Permutations, Subsets, N-Queens)

### Problem List
- **Blind 75**: Complete all 75
- **NeetCode 150**: Complete first 100
- **Microsoft Tagged**: Solve top 50 Microsoft-tagged problems on LeetCode
- **Contests**: Participate in weekly LeetCode contests (Target: Top 15-20%)

### Resources
- **Striver's SDE Sheet** (takeoffwithscholar.com)
- **NeetCode.io** (Roadmap + Video solutions)
- **LeetCode** (Filter: Microsoft, Difficulty: Medium/Hard)

### Milestone Check
- Can solve Medium in < 20 mins without hints
- Can solve Hard in < 40 mins with partial hints
- Contest rating > 1600

---

## Phase 2: Core CS Fundamentals (Weeks 4-8)

**Goal**: Deep understanding of OS, DBMS, Networks, OOPs. Microsoft interviews grill these.

### Operating Systems
- Process vs Thread, Context Switching
- Scheduling algorithms
- Memory management (Paging, Segmentation, Virtual Memory)
- Deadlocks (Conditions, Prevention, Avoidance)
- Semaphores, Mutex, Monitors
- File systems, I/O management
- **Resource**: Gate Smashers (YouTube) or Neso Academy

### DBMS
- Normalization (1NF to BCNF)
- ACID properties, Isolation levels
- Indexing (B-Tree, B+ Tree, Hash)
- SQL vs NoSQL tradeoffs
- Transactions, Locking, Concurrency control
- Query optimization basics
- **Resource**: DBMS by Knowledge Gate or Neso Academy

### Computer Networks
- OSI Model vs TCP/IP
- TCP vs UDP, 3-way handshake
- HTTP/1.1 vs HTTP/2 vs HTTP/3
- DNS, ARP, DHCP
- TLS/SSL handshake
- Load balancing, CDNs
- WebSockets vs REST vs gRPC
- **Resource**: Computer Networks by Neso Academy

### OOPs & Design Patterns
- SOLID principles
- Design Patterns: Singleton, Factory, Observer, Strategy, Builder, Decorator
- Composition over Inheritance
- **Resource**: Refactoring.guru + Head First Design Patterns

### Milestone Check
- Can explain any CS concept with real-world examples
- Can write SQL queries with joins, subqueries, window functions
- Can identify design patterns in code

---

## Phase 3: System Design & Project Deep Dive (Weeks 6-10)

**Goal**: Handle LLD comfortably, basic HLD, and defend NexCore architecture.

### Low-Level Design (LLD)
- **Focus**: Class diagrams, Design Patterns, Schema design
- **Practice Problems**:
  - Design Parking Lot
  - Design Elevator
  - Design Snake & Ladder
  - Design Rate Limiter
  - Design Cache (LRU/LFU)
  - Design URL Shortener (LLD focus)
  - Design Notification Service
- **Resource**: "Grokking the Low Level Design Interview" or ByteByteGo LLD course

### High-Level Design (HLD) — Basics for 2 YOE
- Load Balancing strategies
- Caching strategies (Write-through, Write-back, Cache-aside)
- Database sharding, replication
- Message queues (Kafka, RabbitMQ, NATS)
- Microservices communication patterns
- CAP theorem, Consistency models
- **Resource**: ByteByteGo (Alex Xu) System Design Book Vol 1

### NexCore Deep Dive Preparation
Prepare 1-page summaries for each component. Be ready to answer:

| Component | Questions to Prepare |
|-----------|---------------------|
| **Architecture** | Why 3 services (NestJS, FastAPI, Next.js)? Why not monolith? |
| **Temporal** | Why Temporal over Celery/BullMQ? How do retries work? What happens if worker dies? |
| **LangGraph** | Why state machine approach? How do you handle LLM hallucinations? |
| **NATS** | Why NATS over RabbitMQ/Kafka? How does JetStream work? |
| **Qdrant** | Why vector DB? What embeddings? How do you handle drift? |
| **Intent Compiler** | How does platform-agnostic → platform-specific conversion work? |
| **Scalability** | How would you handle 1000 concurrent executions? |
| **Tradeoffs** | What would you change if you rebuilt it today? |
| **Failures** | Tell me about a bug that took days to fix. |
| **Metrics** | What are the key metrics? How do you monitor them? |

### Milestone Check
- Can design LLD for any standard problem in 30 mins
- Can explain NexCore architecture end-to-end in 5 mins
- Can defend every technology choice with tradeoffs

---

## Phase 4: Mock Interviews & Behavioral (Weeks 8-12)

**Goal**: Interview readiness, communication, negotiation skills.

### Mock Interviews
- **Pramp.com**: Free peer mocks (Do 10+)
- **Interviewing.io**: Anonymous mocks with real engineers
- **Friends/Colleagues**: Do 5+ full mocks (DSA + CS + Project)
- **Record yourself**: Watch playback to fix communication gaps

### Behavioral Preparation (STAR Method)
Prepare 8-10 stories using **Situation → Task → Action → Result**:

1. **Complex technical challenge** (NexCore architecture)
2. **Conflict resolution** (Disagreement on tech choice)
3. **Failure/Learning** (Bug that taught you something)
4. **Leadership** (Mentoring, driving a decision)
5. **Innovation** (AI feature you built)
6. **Tight deadline** (Delivering under pressure)
7. **Customer/Stakeholder focus** (Building for user needs)
8. **Growth mindset** (Learning new tech quickly)

### Microsoft-Specific Behavioral
Microsoft evaluates against **Core Principles**:
- **Create clarity**: Can you simplify complex problems?
- **Generate energy**: Do you motivate others?
- **Deliver success**: Do you ship?
- **Model growth mindset**: Do you learn from failure?

Prepare stories that explicitly demonstrate these.

### Milestone Check
- Mock interview feedback: "Strong hire" from 3+ interviewers
- Can articulate any STAR story in < 2 mins
- Confident, structured communication under pressure

---

## Phase 5: Applications & Negotiation (Weeks 10-16)

**Goal**: Get interviews, clear them, negotiate offers.

### Resume Optimization
- **One page only**
- **Top section**: NexCore project with metrics
  - "Built AI-autonomous testing platform with 3 microservices, LangGraph workflows, Temporal orchestration"
  - "Reduced test maintenance by X%, supports Web/API/Mobile/Desktop/DB"
  - "Tech: TypeScript, Python, Playwright, LangGraph, Temporal, NATS, Qdrant, Next.js"
- **Experience section**: Focus on impact, not duties
  - "Optimized API response time by 40% using caching"
  - "Led migration from X to Y, reducing errors by Z%"
- **Skills**: Group by category (Languages, Frameworks, Infra, AI/ML)
- **Links**: GitHub, Live Demo, LinkedIn

### LinkedIn Optimization
- **Headline**: "Software Engineer | AI & Distributed Systems | Built NexCore (AI Testing Platform)"
- **About**: 3-paragraph story: What you build, why it matters, what you're looking for
- **Featured**: NexCore demo video, GitHub repo link
- **Activity**: Post weekly about technical learnings, NexCore updates

### Application Strategy
- **Apply to 50+ companies** over 4 weeks
- **Referrals first**: Use LinkedIn to find employees, ask for referrals
- **Cold emails**: For startups, email CTO/Engineering Manager directly
- **Job portals**: LinkedIn, Instahyre, Cutshort, Wellfound (AngelList)
- **Track applications**: Spreadsheet with Company, Role, Status, Contact, Follow-up date

### Interview Process
1. **Screening**: HR call → Salary expectations, notice period, basic fit
2. **Technical Round 1**: DSA (2 Medium problems)
3. **Technical Round 2**: DSA (1 Hard) + CS Fundamentals
4. **Technical Round 3**: System Design / Project Deep Dive
5. **Hiring Manager**: Behavioral, team fit, career goals
6. **Offer**: Negotiation

### Negotiation Strategy
- **Never reveal current salary first**. Say: "I'm targeting 20+ LPA based on my skills and market rate."
- **Get competing offers**: Interview with multiple companies simultaneously
- **Anchor high**: If they offer 18, ask for 22. Justify with competing offers or unique skills
- **Total comp**: Base + Bonus + RSUs + Joining Bonus. Negotiate all components
- **Walk away power**: Be willing to decline low offers

---

## Certifications (Optional but Helpful)

**Warning**: Certifications do NOT replace coding skills. Only do these if you have extra time.

| Certification | Value | Effort | When to do |
|---------------|-------|--------|------------|
| **AZ-204 (Azure Developer)** | High for Microsoft | 4-6 weeks | Phase 3 (if targeting Microsoft) |
| **AWS Certified Developer** | High for general market | 4-6 weeks | Phase 3 (if targeting startups) |
| **CKA (Kubernetes)** | Medium for infra roles | 6-8 weeks | Only if applying for DevOps/SRE |
| **GCP Professional Cloud Developer** | Medium | 4-6 weeks | Only if targeting GCP-heavy companies |

**Recommendation**: Skip certs if DSA/Project prep is behind. Your NexCore project is worth 10x more than any cert.

---

## Company List

### Tier 1: Dream Companies (20-40 LPA)
| Company | Why | How to Apply |
|---------|-----|--------------|
| **Microsoft** | Dream company, values builders | Referrals, careers.microsoft.com |
| **Google** | Top tier, DSA heavy | Referrals, careers.google.com |
| **Amazon** | High comp, leadership principles | Referrals, amazon.jobs |
| **Uber** | High comp, system design heavy | Referrals, uber.com/careers |
| **Atlassian** | Great culture, product focus | Referrals, atlassian.com/careers |
| **Adobe** | Good work-life, solid comp | Referrals, adobe.com/careers |
| **Salesforce** | Enterprise, good benefits | Referrals, salesforce.com/careers |
| **Oracle** | Stable, good for juniors | Referrals, oracle.com/careers |
| **Walmart Global Tech** | High hiring volume, good comp | Referrals, careers.walmart.com |
| **Target Corporation** | Good comp, product work | Referrals, target.com/careers |

### Tier 2: High-Growth Product Companies (18-30 LPA)
| Company | Why | How to Apply |
|---------|-----|--------------|
| **BrowserStack** | Testing domain match | Referrals, browserstack.com/careers |
| **Postman** | API domain match | Referrals, postman.com/careers |
| **Razorpay** | Fintech, high growth | Referrals, razorpay.com/careers |
| **CRED** | High comp, product focus | Referrals, cred.club/careers |
| **Zepto** | Quick commerce, high growth | Referrals, zepto.com/careers |
| **Groww** | Fintech, good culture | Referrals, groww.in/careers |
| **Zerodha** | Fintech, engineering culture | Referrals, zerodha.com/careers |
| **Freshworks** | SaaS, global product | Referrals, freshworks.com/careers |
| **Zoho** | Product company, good learning | Direct apply, zoho.com/careers |
| **Hasura** | DevTools, remote-friendly | Referrals, hasura.io/careers |

### Tier 3: AI-First & Remote Startups (20-50 LPA)
| Company | Why | How to Apply |
|---------|-----|--------------|
| **Momentic** | Autonomous testing (direct competitor) | Direct apply, momentic.ai |
| **Octomind** | AI testing (direct competitor) | Direct apply, octomind.dev |
| **BlinqIO** | AI testing (direct competitor) | Direct apply, blinq.io |
| **LangChain** | AI framework, remote | Direct apply, langchain.com |
| **Vercel** | DevTools, remote-friendly | Referrals, vercel.com/careers |
| **Supabase** | Open source, remote | Direct apply, supabase.com/careers |
| **Stripe** | Payments, high comp | Referrals, stripe.com/jobs |
| **GitLab** | Fully remote, DevTools | Direct apply, about.gitlab.com/jobs |
| **Elastic** | Search/Observability, remote | Referrals, elastic.co/careers |
| **HashiCorp** | Infra tools, remote | Referrals, hashicorp.com/careers |

### Tier 4: Service-Based (Avoid or Last Resort)
- **TCS, Infosys, Wipro, Accenture, Cognizant, HCL**
- These cap at 8-12 LPA for 2 YOE. Only apply if desperate.

---

## Microsoft-Specific Preparation

### Interview Format
1. **Online Assessment** (sometimes skipped for referrals)
2. **Phone Screen**: 1-2 DSA Medium problems
3. **Onsite (4-5 rounds)**:
   - Round 1: DSA (Graphs/Trees)
   - Round 2: DSA (DP/Arrays) + CS Fundamentals
   - Round 3: System Design / Project Deep Dive
   - Round 4: Behavioral + Culture Fit
   - Round 5: Hiring Manager (Career goals, team fit)

### What Microsoft Values
- **Growth Mindset**: Learning from failure, curiosity, adaptability
- **Customer Obsession**: Building for user needs
- **Diversity & Inclusion**: Collaborative, respectful
- **One Microsoft**: Cross-team collaboration

### Microsoft DSA Patterns
- Trees & Graphs (very common)
- Arrays & Strings (sliding window, two pointers)
- Dynamic Programming (medium difficulty)
- Linked Lists (manipulation)
- Stacks & Queues

### Microsoft Resources
- **LeetCode**: Filter by Microsoft tag, sort by frequency
- **Glassdoor**: Read recent Microsoft interview experiences
- **YouTube**: "Microsoft Interview Experience" videos
- **Blind app**: Anonymous discussions about Microsoft interviews

---

## Weekly Checklist Template

| Week | DSA | CS Fundamentals | System Design | Project Prep | Applications |
|------|-----|-----------------|---------------|--------------|--------------|
| 1 | Arrays (20) | OS (Processes) | - | NexCore architecture doc | Update resume/LinkedIn |
| 2 | Strings (15) | OS (Memory) | - | Temporal deep dive | 5 referrals requested |
| 3 | Linked Lists (15) | OS (Deadlocks) | LLD: Parking Lot | LangGraph deep dive | 5 applications |
| 4 | Trees (20) | DBMS (Normalization) | LLD: Elevator | NATS/Qdrant deep dive | 5 applications |
| 5 | BST (15) | DBMS (Indexing) | LLD: Rate Limiter | Intent compiler deep dive | 5 applications |
| 6 | Graphs (20) | DBMS (Transactions) | LLD: Cache | Scalability scenarios | 5 applications |
| 7 | DP (15) | DBMS (SQL) | HLD: Basics | Failure stories prep | 5 applications |
| 8 | Heaps (10) | Networks (OSI/TCP) | HLD: Caching | Mock interview 1 | 5 applications |
| 9 | Backtracking (10) | Networks (HTTP/DNS) | HLD: Queues | Mock interview 2 | 5 applications |
| 10 | Mixed Review (20) | Networks (TLS/CDN) | HLD: Sharding | Mock interview 3 | 5 applications |
| 11 | Microsoft Tagged (20) | OOPs/Patterns | LLD Review | Mock interview 4 | 10 applications |
| 12 | Contests (3) | CS Review | HLD Review | Mock interview 5 | 10 applications |

---

## Red Flags to Avoid

1. **Skipping DSA**: No amount of project work compensates for weak DSA in product company interviews
2. **Over-indexing on certs**: Certs don't get you 20 LPA. Coding skills do.
3. **Applying randomly**: Target companies that value builders. Service-based will lowball you.
4. **Not preparing behavioral**: Microsoft and others reject strong coders who can't communicate.
5. **Revealing current salary early**: This anchors negotiations downward.
6. **Accepting first offer**: Always negotiate. Competing offers are your best leverage.
7. **Neglecting CS fundamentals**: Microsoft will ask OS/DBMS/Networks. Don't skip these.
8. **Can't explain NexCore deeply**: If you built it, you should be able to explain every line.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| LeetCode Problems Solved | 250+ |
| Mock Interviews Completed | 10+ |
| Companies Applied To | 50+ |
| Referrals Requested | 20+ |
| Interviews Scheduled | 8-12 |
| Offers Received | 2-3 |
| Final Offer | 20+ LPA |

---

## Final Advice

1. **Consistency > Intensity**: 3 hours daily for 4 months beats 10 hours for 2 weeks
2. **Track progress**: Use a spreadsheet. Review weekly. Adjust if behind.
3. **Health matters**: Sleep 7-8 hours, exercise, eat well. Burnout kills interview performance.
4. **Network**: Connect with engineers at target companies. Referrals increase interview chances 10x.
5. **Believe in yourself**: You built NexCore. You're in the top 1%. The market will pay for that if you can prove it in interviews.

**You can do this. 4-6 months of focused effort will change your career trajectory forever.**

---

*Document Version: 1.0*
*Created: 2026-05-21*
*Status: Ready for Execution*
