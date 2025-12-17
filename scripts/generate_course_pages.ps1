# PowerShell script to generate HTML course catalog pages
# Generates individual course pages and main catalog index

$courses = @(
    @{code="AUT-120"; title="Brake Systems (ASE A5)"; credits=4; level="Lower Division"; hours=60; desc="Comprehensive course covering hydraulic and electronic brake systems including ABS, traction control, and stability systems. Covers disc and drum brakes, master cylinder operation, and diagnostic procedures."; prereq="None"; category="Automotive Technology Core"},
    @{code="AUT-140"; title="Engine Performance I"; credits=5; level="Lower Division"; hours=75; desc="Introduction to internal combustion engine theory, four-stroke cycle, engine measurements, compression testing, and basic diagnostics. Foundation for ASE A8 certification."; prereq="None"; category="Automotive Technology Core"},
    @{code="AUT-150"; title="Electrical Systems Fundamentals"; credits=4; level="Lower Division"; hours=60; desc="Foundation course in automotive electrical theory, including circuit analysis, battery testing, starting and charging systems, and basic wiring diagnostics."; prereq="None"; category="Automotive Technology Core"},
    @{code="AUT-160"; title="Suspension & Steering"; credits=4; level="Lower Division"; hours=60; desc="Study of automotive suspension systems, steering geometry, wheel alignment, and tire service. Prepares for ASE A4 certification."; prereq="None"; category="Automotive Technology Core"},
    @{code="AUT-180"; title="Automatic Transmissions"; credits=5; level="Lower Division"; hours=75; desc="Introduction to automatic transmission operation, fluid service, electronic controls, and basic diagnostics. Covers planetary gears, torque converters, and shift quality analysis."; prereq="AUT-140"; category="Automotive Technology Core"},
    @{code="DSL-160"; title="Diesel Engine Operation"; credits=5; level="Lower Division"; hours=75; desc="Introduction to diesel engine principles, fuel systems, combustion characteristics, and maintenance procedures. Covers direct and indirect injection, glow plugs, and diesel-specific diagnostic techniques."; prereq="None"; category="Diesel Fundamentals"},
    @{code="DSL-170"; title="Diesel Fuel Systems"; credits=4; level="Lower Division"; hours=60; desc="Comprehensive study of diesel fuel injection systems including mechanical, electronic, and common rail systems. Includes fuel filtration, injection timing, and injector testing."; prereq="DSL-160"; category="Diesel Fundamentals"},
    @{code="DSL-180"; title="Air Intake & Exhaust Systems"; credits=4; level="Lower Division"; hours=60; desc="Study of turbochargers, intercoolers, exhaust systems, and emissions control. Covers boost pressure testing, EGR systems, and diesel particulate filters."; prereq="DSL-160"; category="Diesel Fundamentals"},
    @{code="EV-150"; title="Electric Vehicle Fundamentals"; credits=4; level="Lower Division"; hours=60; desc="Introduction to electric vehicle technology including battery systems, electric motors, charging infrastructure, and high-voltage safety protocols."; prereq="AUT-150"; category="EV & Hybrid Technology"},
    @{code="EV-160"; title="Hybrid Vehicle Systems"; credits=4; level="Lower Division"; hours=60; desc="Study of hybrid electric vehicle architectures including series, parallel, and series-parallel designs. Covers regenerative braking, battery management, and hybrid control strategies."; prereq="EV-150"; category="EV & Hybrid Technology"},
    @{code="EV-170"; title="EV Battery Technology"; credits=3; level="Lower Division"; hours=45; desc="Comprehensive coverage of lithium-ion battery technology, battery management systems, thermal management, and battery testing procedures."; prereq="EV-150"; category="EV & Hybrid Technology"},
    @{code="VLB-100"; title="Virtual Lab Safety & Tools"; credits=2; level="Lower Division"; hours=30; desc="Introduction to virtual diagnostic tools, safety procedures, and shop operations in VR environment. Covers tool identification and proper usage."; prereq="None"; category="Virtual Lab Foundations"},
    @{code="VLB-110"; title="Virtual Diagnostic Procedures"; credits=3; level="Lower Division"; hours=45; desc="Hands-on virtual labs teaching systematic diagnostic approaches, scan tool operation, and data interpretation in simulated environments."; prereq="VLB-100"; category="Virtual Lab Foundations"},
    @{code="AUT-320"; title="Advanced Engine Diagnostics"; credits=5; level="Upper Division"; hours=75; desc="Advanced study of fuel injection systems, ignition systems, emission controls, and drivability diagnosis. Prepares for ASE A8 Master certification."; prereq="AUT-140, AUT-150"; category="Advanced Automotive Diagnostics"},
    @{code="AUT-340"; title="Automotive Network Systems"; credits=4; level="Upper Division"; hours=60; desc="Study of automotive communication networks including CAN, LIN, and FlexRay. Covers network diagnostics, module programming, and advanced electrical troubleshooting."; prereq="AUT-150"; category="Advanced Automotive Diagnostics"},
    @{code="AUT-360"; title="ADAS & Driver Assistance"; credits=4; level="Upper Division"; hours=60; desc="Advanced driver assistance systems including adaptive cruise control, lane keeping, automatic emergency braking, and camera/radar calibration."; prereq="AUT-340"; category="Advanced Automotive Diagnostics"},
    @{code="DSL-360"; title="Diesel Emissions Control"; credits=4; level="Upper Division"; hours=60; desc="Advanced study of diesel emission systems including SCR, DPF regeneration, NOx sensors, and emission compliance. Covers EPA regulations and emission testing."; prereq="DSL-170, DSL-180"; category="Advanced Diesel Systems"},
    @{code="DSL-380"; title="Heavy Duty Truck Systems"; credits=5; level="Upper Division"; hours=75; desc="Comprehensive coverage of heavy-duty truck systems including air brakes, hydraulic systems, and truck-specific diagnostics."; prereq="DSL-160"; category="Advanced Diesel Systems"},
    @{code="EV-350"; title="High-Voltage Systems Service"; credits=5; level="Upper Division"; hours=75; desc="Advanced electric vehicle service including high-voltage component replacement, electrical safety, and EV-specific diagnostic procedures."; prereq="EV-150, EV-170"; category="Advanced EV Technology"},
    @{code="EV-360"; title="EV Charging Infrastructure"; credits=3; level="Upper Division"; hours=45; desc="Study of EV charging systems including Level 1/2/3 charging, DC fast charging, charging station installation, and grid integration."; prereq="EV-150"; category="Advanced EV Technology"},
    @{code="EV-370"; title="Advanced Battery Management"; credits=4; level="Upper Division"; hours=60; desc="Advanced battery diagnostics, cell balancing, state of health testing, and battery pack repair/refurbishment procedures."; prereq="EV-170"; category="Advanced EV Technology"},
    @{code="AUT-480"; title="Fleet Management & Operations"; credits=3; level="Upper Division"; hours=45; desc="Study of fleet maintenance management, preventive maintenance programs, cost analysis, and fleet operations software."; prereq="AUT-320"; category="Professional Development"},
    @{code="AUT-490"; title="Capstone Project"; credits=4; level="Upper Division"; hours=60; desc="Comprehensive capstone project demonstrating mastery of automotive diagnostics and repair. Students complete a complex diagnostic case and present findings."; prereq="AUT-320"; category="Professional Development"},
    @{code="DSL-490"; title="Diesel Technology Capstone"; credits=4; level="Upper Division"; hours=60; desc="Advanced diesel diagnostic project demonstrating expertise in diesel systems. Includes performance testing, emission analysis, and comprehensive repair procedures."; prereq="DSL-360"; category="Professional Development"},
    @{code="EV-490"; title="Electric Vehicle Capstone"; credits=4; level="Upper Division"; hours=60; desc="Comprehensive EV project including battery system analysis, high-voltage diagnostics, and EV conversion or repair project."; prereq="EV-350"; category="Professional Development"}
)

# Create output directory
$outputDir = "docs\course_pages"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "🎓 Generating HTML course pages..." -ForegroundColor Cyan

# Generate individual course pages
foreach ($course in $courses) {
    $filename = "$outputDir\$($course.code).html"
    
    $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$($course.code) - $($course.title) | Automotive & Diesel LMS</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px;
        }
        .course-code {
            font-size: 1.2em;
            font-weight: 600;
            opacity: 0.9;
            margin-bottom: 10px;
        }
        .course-title {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 20px;
            line-height: 1.2;
        }
        .course-meta {
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
            font-size: 0.95em;
        }
        .meta-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .meta-icon {
            font-size: 1.2em;
        }
        .content {
            padding: 40px;
        }
        .section {
            margin-bottom: 35px;
        }
        .section-title {
            font-size: 1.5em;
            color: #1e3c72;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }
        .description {
            font-size: 1.1em;
            line-height: 1.8;
            color: #555;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .info-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        .info-label {
            font-weight: 600;
            color: #1e3c72;
            margin-bottom: 5px;
            font-size: 0.9em;
            text-transform: uppercase;
        }
        .info-value {
            font-size: 1.2em;
            color: #333;
        }
        .badge {
            display: inline-block;
            padding: 8px 16px;
            background: #667eea;
            color: white;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: 600;
            margin-top: 10px;
        }
        .badge.lower {
            background: #48bb78;
        }
        .badge.upper {
            background: #ed8936;
        }
        .btn {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 25px;
            font-weight: 600;
            margin-top: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }
        .back-link {
            display: inline-block;
            color: white;
            text-decoration: none;
            margin-bottom: 20px;
            font-size: 0.95em;
            opacity: 0.9;
        }
        .back-link:hover {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="index.html" class="back-link">← Back to Catalog</a>
            <div class="course-code">$($course.code)</div>
            <h1 class="course-title">$($course.title)</h1>
            <div class="course-meta">
                <div class="meta-item">
                    <span class="meta-icon">📚</span>
                    <span>$($course.credits) Credits</span>
                </div>
                <div class="meta-item">
                    <span class="meta-icon">⏱️</span>
                    <span>$($course.hours) Hours</span>
                </div>
                <div class="meta-item">
                    <span class="meta-icon">📍</span>
                    <span>$($course.level)</span>
                </div>
            </div>
        </div>
        
        <div class="content">
            <div class="section">
                <h2 class="section-title">Course Description</h2>
                <p class="description">$($course.desc)</p>
                <span class="badge $(if($course.level -eq 'Lower Division'){'lower'}else{'upper'})">$($course.category)</span>
            </div>
            
            <div class="info-grid">
                <div class="info-card">
                    <div class="info-label">Prerequisites</div>
                    <div class="info-value">$($course.prereq)</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Delivery Mode</div>
                    <div class="info-value">Hybrid</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Course Level</div>
                    <div class="info-value">$($course.level)</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Duration</div>
                    <div class="info-value">$($course.hours) Hours</div>
                </div>
            </div>
            
            <div class="section">
                <h2 class="section-title">Learning Outcomes</h2>
                <p class="description">Upon successful completion of this course, students will be able to:</p>
                <ul style="margin-top: 15px; margin-left: 25px; line-height: 2;">
                    <li>Demonstrate safe and professional shop practices</li>
                    <li>Identify and explain key system components and operation</li>
                    <li>Perform systematic diagnostic procedures</li>
                    <li>Apply industry-standard service and repair techniques</li>
                    <li>Interpret technical data and service information</li>
                </ul>
            </div>
            
            <a href="index.html" class="btn">View All Courses</a>
        </div>
    </div>
</body>
</html>
"@
    
    $html | Out-File -FilePath $filename -Encoding UTF8
    Write-Host "  ✓ Created $($course.code).html" -ForegroundColor Green
}

Write-Host "`n✅ Generated $($courses.Count) course pages!" -ForegroundColor Green
Write-Host "📂 Output directory: $outputDir" -ForegroundColor Cyan
