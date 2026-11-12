FROM php:8.3-apache

# Install MySQL support for PHP
RUN docker-php-ext-install pdo_mysql mysqli

# Enable Apache URL rewriting
RUN a2enmod rewrite

# Copy PHP backend files
COPY . /var/www/html/

# Set working directory
WORKDIR /var/www/html

# Configure Apache to listen on Render's port
RUN sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:10000>/' /etc/apache2/sites-available/000-default.conf

EXPOSE 10000

CMD ["apache2-foreground"]