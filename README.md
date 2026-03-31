# ICTM-Trainer
Web application and discord bot to train for both Illinois and Nation wide math competitions. Covers ICTM events, NSML, AMC, AIME, ARML tryouts, and topic specific training. 

### Project Architecture (PHASE 1 - Discord Bot):

#### Data Collection:
- Problems image files are avalible, but need to be smartly segmented. An LLM method may be needed.
- If our segmentation method is good labels should be avalible, otherwise we need to label the images.
- Good cloud storage solutions
- Difficultly segmentation should be LLM judged or generalized with some formula off of location. 

#### Text input
- Set of commands would need to include
  * Catagories
  * Event (if ICTM)
  * Timed or not timed
  * Difficulty
  * Topic
  * 
  * /practiceProblem (competition, topic, difficulty)
  * /practiceTest (amount, topic, difficulty)
  * /test (event)
  * /timedProblem (time, Competiton, topic, difficulty)
  * /timedTest (time, amount, topic, difficulty)
  * /problemAnswer (value)
  * /testAnswers (value (Comma Seperated) )
  * /inputParameters (competition, topic, difficulty)
  * /leaderboard (local or global) 

#### Tracking
- Bot should be able to track correct answers in a session across discord accounts
- Bot should be able to make a server wide and global leaderboard

#### MISC:
- Suggestion form
- Bug fix form
- Easy Installation
- Decently performant
**- Could also be used for daily problems, using same segmentation shceme**
  - Funded ourselves, in an ambutous future could be charged for, but user base is much more important 

<img width="785" height="635" alt="image" src="https://github.com/user-attachments/assets/981cb8b5-4226-420d-963a-313ba0978343" />

### Project Architecture (PHASE 2 - Web Application):

#### Function 
- Operate anywhere anytime
- Digital sracth paper for Ipads
- Track user accounts and data
  * Progress
  * Accuracy
  * Weaknesses
  * Spaced Repetition Algorithm????

#### Data
- Possibly updated problem bank

<hr>

### PHASE 1:

#### Data

##### Competitions and their Labels:

<img width="1148" height="597" alt="image" src="https://github.com/user-attachments/assets/431120b7-43e1-4110-ae82-fbcb4b12591a" />






