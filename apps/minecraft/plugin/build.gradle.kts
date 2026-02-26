import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar

plugins {
    kotlin("jvm") version "2.0.21"
    id("com.gradleup.shadow") version "8.3.5"
}

group = "dev.nyaru"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    implementation("com.google.code.gson:gson:2.10.1")
}

kotlin {
    jvmToolchain(21)
}

tasks.withType<ShadowJar> {
    archiveClassifier.set("")
    relocate("okhttp3", "dev.nyaru.shade.okhttp3")
    relocate("okio", "dev.nyaru.shade.okio")
    relocate("kotlinx.coroutines", "dev.nyaru.shade.kotlinx.coroutines")
    relocate("com.google.gson", "dev.nyaru.shade.gson")
}

tasks.build {
    dependsOn(tasks.shadowJar)
}
